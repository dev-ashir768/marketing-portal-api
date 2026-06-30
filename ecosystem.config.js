module.exports = {
  apps: [
    {
      name: "marketing-portal",
      script: "dist/server.js",
      cwd: __dirname,
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
      },
      // Restart on crash, but back off if it keeps crashing to avoid a restart loop.
      max_restarts: 10,
      min_uptime: "30s",
      error_file: "./logs/error.log",
      out_file: "./logs/out.log",
      time: true,
    },
  ],
};
