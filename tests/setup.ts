// Set up environment variables for tests
process.env['OPENROUTER_API_KEY'] = 'test-api-key';
process.env['TELEGRAM_BOT_TOKEN'] = 'test-bot-token';
process.env['WEBCHAT_ENABLED'] = 'false';
process.env['DATA_DIR'] = '/tmp/pibot-test';
process.env['LOG_LEVEL'] = 'silent';
