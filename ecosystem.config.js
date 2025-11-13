module.exports = {
  apps: [
    {
      name: 'ttsscore-api',
      script: 'dist/main.js',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_restarts: 10,
      env: {
        NODE_ENV: 'production',
        PORT: '3000',
        TOKEN_ENCRYPTION_KEY: '75c054dce8cee50058af9604d6356a24026cb4b87787df632966d338bdc82639',
        MIDDLEWARE_API_KEY: '75c054dce8cee50058af9604d6356a24026cb4b87787df632966d338bdc82639'
      },
    },
  ],
};
