const AWS = require('aws-sdk');
const fs = require('fs');
const path = require('path');

// Configure AWS SDK
const s3 = new AWS.S3({
	accessKeyId: '9CSIDGBLAMFYRNV1S8QD',
	secretAccessKey: 'zBGCjSOp0CiaHZ5SXYSYhuSDPmKYUeizjsNcN5ma',
	endpoint: 's3.wasabisys.com',
	region: 'us-east-2', // Add this line
	sslEnabled: true,
	s3ForcePathStyle: true,
});

// File to upload
const filePath = 'defaultdb.backup'; // Adjust the path to your .backup file
const bucketName = 'golden-backup'; // Replace with your actual bucket name
const keyName = path.basename(filePath); // The name the file will have in S3

// Upload to S3
const upload = async () => {
	try {
		const fileStream = fs.createReadStream(filePath);
		const fileSize = fs.statSync(filePath).size;

		const params = {
			Bucket: bucketName,
			Key: keyName,
			Body: fileStream,
		};

		const managedUpload = s3.upload(params);

		managedUpload.on('httpUploadProgress', (progress) => {
			const percentage = ((progress.loaded / fileSize) * 100).toFixed(2);
			console.log(`Upload progress: ${percentage}%`);
		});

		const data = await managedUpload.promise();
		console.log('Successfully uploaded to S3:', data.Location);
	} catch (err) {
		console.error('Error uploading to S3:', err);
	}
};

upload();
