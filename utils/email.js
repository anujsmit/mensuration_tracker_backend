// anujsmit/mensuration_tracker_backend/mensuration_tracker_backend-b270fad9aad702aa4e349ee6e2e2cfd2756512dc/utils/email.js (MODIFIED)
const nodemailer = require('nodemailer');
require('dotenv').config();

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    secure: process.env.SMTP_PORT == 465,
    auth: {
        user: process.env.SMTP_USERNAME,
        pass: process.env.SMTP_PASSWORD,
    },
});

// New utility to send email with raw HTML content (used for password reset flows)
const sendRawEmail = async (to, subject, htmlContent) => {
    try {
        await transporter.sendMail({
            from: `Menstrual Health App <${process.env.SMTP_USERNAME}>`,
            to,
            subject,
            html: htmlContent,
        });
        return true;
    } catch (error) {
        console.error('Error sending raw email:', error);
        throw new Error('Failed to send email');
    }
};

const sendNotificationEmail = async (to, name, title, message) => {
    const htmlBody = `
        <html>
            <body>
                <h2>${title}</h2>
                <p>Hello ${name},</p>
                <div>${message}</div>
                <p>This is an automated notification from Menstrual Health App.</p>
            </body>
        </html>
    `;

    try {
        await transporter.sendMail({
            from: `Menstrual Health App <${process.env.SMTP_USERNAME}>`,
            to,
            subject: title,
            html: htmlBody,
        });
        return true;
    } catch (error) {
        console.error('Error sending notification email:', error);
        throw new Error('Failed to send notification email');
    }
};

module.exports = {
    sendNotificationEmail,
    sendRawEmail
};