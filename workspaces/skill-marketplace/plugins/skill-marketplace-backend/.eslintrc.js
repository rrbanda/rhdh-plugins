const config = require('@backstage/cli/config/eslint-factory')(__dirname);
config.rules = { ...config.rules, '@backstage/no-undeclared-imports': 'off' };
module.exports = config;
