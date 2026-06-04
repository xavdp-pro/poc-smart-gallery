module.exports = {
  apps: [
    {
      name: 'smartgalery-backend',
      script: 'server/index.js',
      cwd: '/apps/smartgalery-v1/app',
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'production',
      },
      error_file: '/apps/smartgalery-v1/app/logs/backend-error.log',
      out_file: '/apps/smartgalery-v1/app/logs/backend-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    },
    {
      name: 'smartgalery-frontend',
      script: 'static-server.cjs',
      cwd: '/apps/smartgalery-v1/app',
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '200M',
      env: {
        NODE_ENV: 'production',
      },
      error_file: '/apps/smartgalery-v1/app/logs/frontend-error.log',
      out_file: '/apps/smartgalery-v1/app/logs/frontend-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    },
  ],
};
