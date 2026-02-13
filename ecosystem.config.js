module.exports = {
  apps: [
    {
      name: "torrent-movie-search",
      script: "node_modules/.bin/next",
      args: "start",
      cwd: "/home/bitsec/torrent-movie-search",
      env: {
        NODE_ENV: "production",
        PORT: 3000,
      },
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "512M",
      log_date_format: "YYYY-MM-DD HH:mm:ss",
      error_file: "/home/bitsec/torrent-movie-search/logs/error.log",
      out_file: "/home/bitsec/torrent-movie-search/logs/out.log",
      merge_logs: true,
    },
  ],
};
