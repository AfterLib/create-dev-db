import knex from 'knex';
import dotenv from 'dotenv';
import kpd from './knex-postgresql-deadlock.js';

// Load environment variables from .env file
dotenv.config();

const charset = 'utf8mb4';
const host = process.env.DEVELOPMENT_DB_HOST;
const db_name = process.env.DEVELOPMENT_DB_NAME;
const user = process.env.DEVELOPMENT_DB_USER;
const pass = process.env.DEVELOPMENT_DB_PASS;
const port = process.env.DEVELOPMENT_DB_PORT;

const db = knex({
	client: kpd,
	connection: {
		host: host,
		user: user,
		password: pass,
		database: db_name,
		charset: charset,
		port: port,
		ssl: {rejectUnauthorized: false},
		application_name: 'bot-cleaner',
	},
	pool: {
		min: 0,
		max: 30,
		acquireTimeoutMillis: 60000,
		createTimeoutMillis: 60000,
		destroyTimeoutMillis: 60000,
		idleTimeoutMillis: 30000,
		reapIntervalMillis: 1000,
		createRetryIntervalMillis: 2000,
	},
	options: {
		deadlockRetries: 6,
		deadlockRetryDelay: 10000,
	},
});

// Function to create a shared counter
function createSharedCounter() {
	let count = 0;
	return {
		increment: (value) => {
			count += value;
			return count;
		},
		getCount: () => count,
	};
}

// Function to fetch page_ids in batches
async function fetchPageIdsInBatches(batchSize = 10000) {
	console.log('Fetching all pages to update in batches...');
	let allPageIds = [];
	let lastPageId = 0;

	while (true) {
		const result = await db.raw(
			`
			SELECT ca.page_id
			FROM collection_ad ca
			WHERE ca.page_id > ?
			GROUP BY ca.page_id
			HAVING COUNT(*) = SUM(CASE WHEN ca.deleted THEN 1 ELSE 0 END)
			ORDER BY ca.page_id
			LIMIT ?
		`,
			[lastPageId, batchSize],
		);

		const pageIds = result.rows.map((row) => row.page_id);
		allPageIds = allPageIds.concat(pageIds);

		if (pageIds.length < batchSize) {
			break;
		}

		lastPageId = pageIds[pageIds.length - 1];
		console.log(`Fetched ${allPageIds.length} page IDs so far...`);
	}

	console.log(`Fetched ${allPageIds.length} page IDs in total`);
	return allPageIds;
}

// Function to update records in chunks
async function updateRecordsInChunks(pageIds, counter) {
	const chunkSize = 250;
	let localUpdatedCount = 0;

	for (let i = 0; i < pageIds.length; i += chunkSize) {
		const chunk = pageIds.slice(i, i + chunkSize);
		console.log(`Updating ${chunk.length} collection pages...`);
		const result = await db('collection_page').whereIn('page_id', chunk).update({deleted: true});

		const updatedRowsCount = result;
		localUpdatedCount += updatedRowsCount;
		const totalUpdated = counter.increment(updatedRowsCount);

		console.log(`Updated ${updatedRowsCount} collection pages. Total updated across all operations: ${totalUpdated}`);
	}

	return localUpdatedCount;
}

// Main function to run the script
async function main() {
	try {
		console.log('Starting to fetch all page IDs in batches...');
		const allPageIds = await fetchPageIdsInBatches();
		console.log(`Fetched ${allPageIds.length} page IDs in total. Starting update process...`);

		const workerCount = 5; // Number of parallel operations
		console.log(`Starting with ${workerCount} parallel operations...`);

		const sharedCounter = createSharedCounter();
		const startTime = Date.now();

		const fixedChunkSize = 1000; // Set a fixed chunk size of 1000

		const updatePromises = [];
		for (let i = 0; i < workerCount; i++) {
			const workerPageIds = allPageIds.slice(i * fixedChunkSize);
			updatePromises.push(updateRecordsInChunks(workerPageIds, sharedCounter));
		}

		await Promise.all(updatePromises);

		const endTime = Date.now();
		const totalTimeMinutes = (endTime - startTime) / 60000;
		const totalUpdatedCount = sharedCounter.getCount();
		const overallRowsPerMinute = totalUpdatedCount / totalTimeMinutes;

		console.log(`Total updated records: ${totalUpdatedCount}`);
		console.log(`Total time: ${totalTimeMinutes.toFixed(2)} minutes`);
		console.log(`Overall rate: ${overallRowsPerMinute.toFixed(2)} rows/minute`);
	} catch (error) {
		console.error('Error during update operation:', error);
	} finally {
		await db.destroy();
	}
}

// Run the main function
main();
