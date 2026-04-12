module.exports = {
  apps: [
    {
      name: 'smartgallery-backend',
      script: 'server/index.js',
      cwd: '/apps/smartgallery-v2/app',
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      watch: true,
      ignore_watch: ['node_modules', 'logs', 'data', 'uploads', 'mds', 'docs', 'src', 'public'],
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'development',
      },
      error_file: '/apps/smartgallery-v2/app/logs/backend-error.log',
      out_file: '/apps/smartgallery-v2/app/logs/backend-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    },
    {
      name: 'smartgallery-frontend',
      script: 'static-server.cjs',
      cwd: '/apps/smartgallery-v2/app',
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '200M',
      env: {
        NODE_ENV: 'production',
      },
      error_file: '/apps/smartgallery-v2/app/logs/frontend-error.log',
      out_file: '/apps/smartgallery-v2/app/logs/frontend-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    },
  ],
};
