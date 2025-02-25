const { exec } = require("child_process");

exec("npx pm2 start ecosystem.config.js", (err, stdout, stderr) => {
  if (err) {
    console.error(`Exec error: ${err}`);
    return;
  }
  console.log(`stdout: ${stdout}`);
  console.error(`stderr: ${stderr}`);
});
