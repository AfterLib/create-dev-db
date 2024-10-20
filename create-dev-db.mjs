import knex from 'knex';
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

// Initialize Knex with your database configuration from environment variables
const charset = 'utf8mb4';
const host = process.env.DEVELOPMENT_DB_HOST;
const db_name = process.env.DEVELOPMENT_DB_NAME;
const user = process.env.DEVELOPMENT_DB_USER;
const pass = process.env.DEVELOPMENT_DB_PASS;
const port = process.env.DEVELOPMENT_DB_PORT;

const db = knex({
	client: 'pg',
	connection: {
		host: host,
		user: user,
		password: pass,
		database: db_name,
		charset: charset,
		port: port,
		ssl: {rejectUnauthorized: false},
		application_name: 'create-dev-db',
	},
	pool: {
		min: 0,
		max: 10,
		acquireTimeoutMillis: 60000,
		createTimeoutMillis: 60000,
		destroyTimeoutMillis: 60000,
		idleTimeoutMillis: 30000,
		reapIntervalMillis: 1000,
		createRetryIntervalMillis: 2000,
	},
});

// Helper function to generate a random string
function generateRandomString(length) {
	const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	let result = '';
	for (let i = 0; i < length; i++) {
		result += chars.charAt(Math.floor(Math.random() * chars.length));
	}
	return result;
}

// Helper function to randomize a string
function randomizeString(str) {
	if (str === null || str === undefined) {
		return str; // Return the original value if it's null or undefined
	}
	return str.replace(/[a-zA-Z]/g, (char) => {
		const randomChar = String.fromCharCode(
			char.toLowerCase() === char ? 97 + Math.floor(Math.random() * 26) : 65 + Math.floor(Math.random() * 26),
		);
		return randomChar;
	});
}

// Optimized function to process a table in batches with custom sort column
async function processBatches(tableName, batchSize, processRows, sortColumn = 'id') {
	let offset = 0;
	let batchCount = 0;
	console.log(`Starting to process ${tableName} in batches of ${batchSize}`);

	let currentBatch = await db(tableName).select('*').orderBy(sortColumn).offset(offset).limit(batchSize);

	do {
		console.log(`Processing batch ${batchCount + 1} from ${tableName}`);

		const processPromise = processRows(currentBatch);

		// Fetch the next batch while processing the current one
		const nextBatchPromise = db(tableName)
			.select('*')
			.orderBy(sortColumn)
			.offset(offset + batchSize)
			.limit(batchSize);

		// Wait for both the current batch processing and the next batch fetch to complete
		const [nextBatch] = await Promise.all([nextBatchPromise, processPromise]);

		offset += batchSize;
		batchCount++;
		console.log(`Completed batch ${batchCount} of ${tableName}. Total rows processed: ${offset}`);

		// Update currentBatch for the next iteration
		currentBatch = nextBatch;
	} while (currentBatch.length > 0);

	console.log(`Finished processing ${tableName}. Total batches: ${batchCount}, Total rows: ${offset}`);
}

// Updated function to randomize specific fields in the database
async function randomizeFields() {
	try {
		console.log('Randomizing specific fields in the database...');

		const batchSize = 10; // Adjust this value as needed

		// Randomize collection_ad fields

		await processBatches('collection_ad', batchSize, async (batch) => {
			const updateData = batch.map((row) => ({
				id: row.id,
				headline: randomizeString(row.headline),
				link_description: randomizeString(row.link_description),
				body: randomizeString(row.body),
				duplicates: row.duplicates === 0 ? 0 : Math.floor(Math.random() * 10) + 1,
				offer_link: randomizeString(row.offer_link),
			}));

			return db.raw(
				`
				update collection_ad
				set
					headline = data_table.headline,
					link_description = data_table.link_description,
					body = data_table.body,
					duplicates = data_table.duplicates::integer,
					offer_link = data_table.offer_link
				from (
					select
						unnest(array [${updateData.map(() => '?').join(',')}]) as id,
						unnest(array [${updateData.map(() => '?').join(',')}]) as headline,
						unnest(array [${updateData.map(() => '?').join(',')}]) as link_description,
						unnest(array [${updateData.map(() => '?').join(',')}]) as body,
						unnest(array [${updateData.map(() => '?').join(',')}]) as duplicates,
						unnest(array [${updateData.map(() => '?').join(',')}]) as offer_link
				) as data_table
				where collection_ad.id::text = data_table.id;
			`,
				[
					...updateData.map((e) => e.id),
					...updateData.map((e) => e.headline),
					...updateData.map((e) => e.link_description),
					...updateData.map((e) => e.body),
					...updateData.map((e) => e.duplicates),
					...updateData.map((e) => e.offer_link),
				],
			);
		});

		// Randomize collection_card fields
		await processBatches('collection_card', batchSize, async (batch) => {
			const updateData = batch.map((row) => ({
				id: row.id,
				title: randomizeString(row.title),
				body: randomizeString(row.body),
				caption: randomizeString(row.caption),
				link_url: randomizeString(row.link_url),
				link_description: randomizeString(row.link_description),
			}));

			return db.raw(
				`
				update collection_card
				set
					title = data_table.title,
					body = data_table.body,
					caption = data_table.caption,
					link_url = data_table.link_url,
					link_description = data_table.link_description
				from (
					select
						unnest(array [${updateData.map(() => '?').join(',')}]) as id,
						unnest(array [${updateData.map(() => '?').join(',')}]) as title,
						unnest(array [${updateData.map(() => '?').join(',')}]) as body,
						unnest(array [${updateData.map(() => '?').join(',')}]) as caption,
						unnest(array [${updateData.map(() => '?').join(',')}]) as link_url,
						unnest(array [${updateData.map(() => '?').join(',')}]) as link_description
				) as data_table
				where collection_card.id::text = data_table.id;
			`,
				[
					...updateData.map((e) => e.id),
					...updateData.map((e) => e.title),
					...updateData.map((e) => e.body),
					...updateData.map((e) => e.caption),
					...updateData.map((e) => e.link_url),
					...updateData.map((e) => e.link_description),
				],
			);
		});

		// Randomize collection_page fields
		await processBatches('collection_page', batchSize, async (batch) => {
			const updateData = batch.map((row) => ({
				id: row.id,
				page_name: randomizeString(row.page_name),
			}));

			return db.raw(
				`
				update collection_page
				set
					page_name = data_table.page_name
				from (
					select
						unnest(array [${updateData.map(() => '?').join(',')}]) as id,
						unnest(array [${updateData.map(() => '?').join(',')}]) as page_name
				) as data_table
				where collection_page.id::text = data_table.id;
			`,
				[...updateData.map((e) => e.id), ...updateData.map((e) => e.page_name)],
			);
		});

		// Randomize user fields
		await processBatches('user', batchSize, async (batch) => {
			const updateData = batch.map((row) => ({
				id: row.id,
				security_token: generateRandomString(64),
				first_name: randomizeString(row.first_name),
				last_name: randomizeString(row.last_name),
			}));

			return db.raw(
				`
				update "user"
				set
					security_token = data_table.security_token,
					first_name = data_table.first_name,
					last_name = data_table.last_name
				from (
					select
						unnest(array [${updateData.map(() => '?').join(',')}]) as id,
						unnest(array [${updateData.map(() => '?').join(',')}]) as security_token,
						unnest(array [${updateData.map(() => '?').join(',')}]) as first_name,
						unnest(array [${updateData.map(() => '?').join(',')}]) as last_name
				) as data_table
				where "user".id::text = data_table.id;
			`,
				[
					...updateData.map((e) => e.id),
					...updateData.map((e) => e.security_token),
					...updateData.map((e) => e.first_name),
					...updateData.map((e) => e.last_name),
				],
			);
		});

		console.log('All specified fields have been randomized successfully.');
	} catch (error) {
		console.error('Error during field randomization:', error);
	}
}

// Main function to execute the script
async function main() {
	console.log('Starting the setup process for the development database...');

	try {
		console.log('The process will start now. This will take a while...');

		console.log('Randomizing specific fields...');
		await randomizeFields();

		console.log('Development database setup complete.');
	} catch (error) {
		console.error('An error occurred:', error);
	} finally {
		await db.destroy();
	}
}

// Run the main function
main();
