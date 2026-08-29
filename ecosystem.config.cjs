// PM2 process definition. Named .cjs since package.json sets "type": "module"
// and PM2 loads this file as CommonJS.
module.exports = {
  apps: [
    {
      name: 'shiftsync-api',
      script: 'dist/main.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '400M',
      env_production: {
        NODE_ENV: 'production',
      },
    },
  ],
};
