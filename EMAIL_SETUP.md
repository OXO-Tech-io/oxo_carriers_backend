# Email Configuration Guide

This guide explains how to configure Gmail SMTP for sending emails from the HRIS Payroll System.

## Gmail SMTP Setup

### Step 1: Enable 2-Step Verification

1. Go to your [Google Account](https://myaccount.google.com/)
2. Navigate to **Security** section
3. Enable **2-Step Verification** if not already enabled

### Step 2: Generate App Password

1. Go to [App Passwords](https://myaccount.google.com/apppasswords)
2. Select **Mail** as the app
3. Select **Other (Custom name)** as the device
4. Enter "HRIS Payroll System" as the name
5. Click **Generate**
6. Copy the 16-character password (it will look like: `abcd efgh ijkl mnop`)

### Step 3: Configure Environment Variables

Create or update your `.env` file in the `backend` directory:

```env
# Gmail SMTP Configuration
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-16-character-app-password
SMTP_FROM=your-email@gmail.com

# Frontend URL (for email links)
FRONTEND_URL=http://localhost:3000
```

**Important Notes:**
- Use the **16-character App Password** (not your regular Gmail password)
- Remove spaces from the App Password when pasting it
- The `SMTP_USER` and `SMTP_FROM` should be the same Gmail address

### Step 4: Test Email Configuration

When you start the backend server, you should see:
```
✅ Email server is ready to send messages
```

If you see an error, check:
1. Your App Password is correct
2. 2-Step Verification is enabled
3. The email address is correct
4. No extra spaces in the App Password

## Email Types Sent by the System

### 1. Email Verification
- **When**: Sent when a new employee is created
- **Purpose**: Verify the employee's email address
- **Link Expiry**: 24 hours
- **Endpoint**: `/api/auth/verify-email?token=<token>`

### 2. Password Setup Email
- **When**: Sent when a new employee is created
- **Purpose**: Allow employee to set their initial password
- **Link Expiry**: 7 days
- **Endpoint**: `/api/auth/reset-password` (POST with token)

### 3. Password Reset Email
- **When**: Sent when user requests password reset or admin resets password
- **Purpose**: Allow user to reset their password
- **Link Expiry**: 1 hour
- **Endpoint**: `/api/auth/reset-password` (POST with token)

## Troubleshooting

### Error: "Invalid login"
- Make sure you're using an App Password, not your regular password
- Verify 2-Step Verification is enabled

### Error: "Connection timeout"
- Check your firewall settings
- Verify SMTP_PORT is 587 (or 465 for SSL)

### Emails not being received
- Check spam/junk folder
- Verify the recipient email address is correct
- Check server logs for email sending errors

## Alternative Email Providers

If you prefer not to use Gmail, you can configure other SMTP providers:

### Outlook/Hotmail
```env
SMTP_HOST=smtp-mail.outlook.com
SMTP_PORT=587
```

### SendGrid
```env
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASS=your-sendgrid-api-key
```

### Mailgun
```env
SMTP_HOST=smtp.mailgun.org
SMTP_PORT=587
SMTP_USER=your-mailgun-username
SMTP_PASS=your-mailgun-password
```
