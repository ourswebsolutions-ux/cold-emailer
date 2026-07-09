const Imap = require("imap");

const imap = new Imap({
  user: "ourswebsolutions@gmail.com",
  password: "pmfaylnbssnnwwmr",

  host: "imap.gmail.com",
  port: 993,

  tls: true,

  tlsOptions: {
    servername: "imap.gmail.com",
    rejectUnauthorized: true
  }
});

imap.once("ready", () => {
  console.log("IMAP CONNECTED ✅");
  imap.end();
});

imap.once("error", (err) => {
  console.error("IMAP ERROR ❌");
  console.error(err);
});

imap.once("end", () => {
  console.log("Connection ended");
});

imap.connect();