import knex from 'knex';
import dotenv from 'dotenv';
import kpd from './knex-postgresql-deadlock.js';

// Load environment variables from .env file
dotenv.config();

// Initialize Knex with your database configuration from environment variables
const charset = 'utf8mb4';
const host = process.env.DEVELOPMENT_DB_HOST;
const db_name = process.env.DEVELOPMENT_DB_NAME;
const user = process.env.DEVELOPMENT_DB_USER;
const pass = process.env.DEVELOPMENT_DB_PASS;
const port = process.env.DEVELOPMENT_DB_PORT;

console.log('You are connected to the database', host);

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

console.log('created_at < NOW() - INTERVAL 3 weeks');

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

// Function to update records in chunks
async function updateRecordsInChunks(counter) {
	const chunkSize = 250;
	let localUpdatedCount = 0;

	while (true) {
		console.log('Updating records...');
		const result = await db.raw(
			`
			WITH to_update AS (
				SELECT id
				FROM collection_ad
				WHERE created_at < NOW() - INTERVAL '3 weeks'
				AND deleted = false
				LIMIT ?
				FOR UPDATE SKIP LOCKED
			)
			UPDATE collection_ad
			SET deleted = true
			FROM to_update
			WHERE collection_ad.id = to_update.id
			RETURNING collection_ad.id
			`,
			[chunkSize],
		);

		const updatedRows = result.rows ? result.rows : result;
		const updatedRowsCount = updatedRows.length;

		localUpdatedCount += updatedRowsCount;
		const totalUpdated = counter.increment(updatedRowsCount);

		console.log(`Updated ${updatedRowsCount} records. Total updated across all operations: ${totalUpdated}`);

		if (updatedRowsCount < chunkSize) {
			break;
		}
	}

	return localUpdatedCount;
}

// Main function to run the script
async function main() {
	try {
		const workerCount = 20; // Number of parallel operations
		console.log(`Starting with ${workerCount} parallel operations...`);

		const sharedCounter = createSharedCounter();
		let activeWorkers = 0;
		let completedWorkers = 0;

		const startTime = Date.now();
		let lastLogTime = startTime;
		let lastLogCount = 0;

		async function runWorker() {
			activeWorkers++;
			const updatedCount = await updateRecordsInChunks(sharedCounter);
			activeWorkers--;
			completedWorkers++;

			const currentTime = Date.now();
			const elapsedSeconds = (currentTime - lastLogTime) / 1000;

			if (elapsedSeconds >= 60) {
				const totalCount = sharedCounter.getCount();
				const countSinceLastLog = totalCount - lastLogCount;
				const rowsPerMinute = countSinceLastLog / (elapsedSeconds / 60);

				console.log(`Rows updated in last minute: ${countSinceLastLog}`);
				console.log(`Current rate: ${rowsPerMinute.toFixed(2)} rows/minute`);

				lastLogTime = currentTime;
				lastLogCount = totalCount;
			}

			if (updatedCount > 0) {
				// If there were rows updated, start another worker
				runWorker();
			}
		}

		// Start initial batch of workers
		for (let i = 0; i < workerCount; i++) {
			runWorker();
		}

		// Wait until all workers are done
		while (activeWorkers > 0) {
			await new Promise((resolve) => setTimeout(resolve, 1000));
		}

		const endTime = Date.now();
		const totalTimeMinutes = (endTime - startTime) / 60000;
		const totalUpdatedCount = sharedCounter.getCount();
		const overallRowsPerMinute = totalUpdatedCount / totalTimeMinutes;

		console.log(`Total updated records: ${totalUpdatedCount}`);
		console.log(`Total worker runs: ${completedWorkers}`);
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
