/* eslint-disable camelcase, no-underscore-dangle */
'use strict';

// Custom postgresql dialect, with deadlock retries
const Client_PostgreSQL = require('knex/lib/dialects/postgres');

class Client_PostgreSQL_deadlock extends Client_PostgreSQL {
	constructor(config) {
		super(config);

		const { deadlockRetries, deadlockRetryDelay, logger } = config.options || {};

		this.deadlockRetries = deadlockRetries || 8;
		this.deadlockRetryDelay = deadlockRetryDelay || 5000; // default delay
		this.logger = logger || console;
	}

	_query(connection, obj) {
		let retryAmount = this.deadlockRetries;
		const logger = this.logger;

		const runQuery = () =>
			Reflect.apply(super._query, this, arguments).catch(async (error) => {
				// PostgreSQL deadlock error code is '40P01'

				const repeatErrors = ['40P01', '40001', '57P01', undefined];

				if (!repeatErrors.includes(error.code))
					console.log('KPD: Error - No repeat: ', error.code, ' retry: ', retryAmount);

				if (retryAmount > 0 && repeatErrors.includes(error.code)) {
					logger.info(`Deadlock detected (code ${error.code}), retrying, (${retryAmount}) more attempts before error`);
					const retryDelay = this.deadlockRetryDelay;
					if (retryDelay) {
						await new Promise((resolve) => setTimeout(resolve, retryDelay));
					}
					retryAmount--; // Decrement the retry amount
					return runQuery();
				}
				throw error;
			});

		return runQuery();
	}
}

module.exports = Client_PostgreSQL_deadlock;
