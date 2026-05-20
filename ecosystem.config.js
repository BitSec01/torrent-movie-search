module.exports = {
	apps: [
		{
			name: 'torrent-movie-search',
			script: 'server.js',
			cwd: '/home/bit1/torrent-movie-search',
			env: {
				NODE_ENV: 'production',
				PORT: 3000,
				HOSTNAME: '0.0.0.0',
			},
			instances: 1,
			autorestart: true,
			watch: false,
			max_memory_restart: '1G',
			log_date_format: 'YYYY-MM-DD HH:mm:ss',
			error_file: '/home/bit1/torrent-movie-search/logs/error.log',
			out_file: '/home/bit1/torrent-movie-search/logs/out.log',
			merge_logs: true,
		},
	],
}
