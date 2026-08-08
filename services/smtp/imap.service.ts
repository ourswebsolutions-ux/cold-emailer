import Imap from "imap";
import { simpleParser, ParsedMail } from "mailparser";
import dns from "node:dns/promises";

/** Configuration required to connect to an IMAP mailbox. */
export interface IMAPConfig {
  username: string;
  password: string;
}

/** Strongly-typed representation of a parsed email returned by the service. */
export interface ParsedEmail {
  headers: ParsedMail["headers"];
  subject?: string;
  from?: ParsedMail["from"];
  to?: ParsedMail["to"];
  cc?: ParsedMail["cc"];
  bcc?: ParsedMail["bcc"];
  date?: Date;
  messageId?: string;
  inReplyTo?: string;
  references?: string | string[];
  text?: string;
  html?: string | false;
  attachments: ParsedMail["attachments"];
  /** Original mailparser result kept for full fidelity. */
  raw: ParsedMail;
}

/**
 * Resolve the IPv4 address of imap.gmail.com.
 * Falls back to a known Gmail IMAP IP when DNS lookup fails.
 */
export async function resolveGmailIMAP(): Promise<string> {
  try {
    const result = await dns.lookup("imap.gmail.com", { family: 4 });
    console.log("✅ Gmail IP:", result.address);
    return result.address;
  } catch (error) {
    console.log("⚠️ DNS failed using fallback");
    console.log("DNS error details:", error instanceof Error ? error.message : error);
    return "74.125.68.109";
  }
}

/**
 * Create a configured IMAP client instance connected to Gmail.
 * The connection is not established until `.connect()` is called.
 */
export async function createIMAPConnection(config: IMAPConfig): Promise<Imap> {
  if (!config?.username || !config?.password) {
    throw new Error("IMAP config must include username and password");
  }

  const ip = await resolveGmailIMAP();

  console.log("🚀 Creating IMAP", {
    ip,
    user: config.username,
  });

  const imap = new Imap({
    user: config.username,
    password: config.password,
    host: ip,
    port: 993,
    tls: true,
    tlsOptions: {
      servername: "imap.gmail.com",
      rejectUnauthorized: true,
    },
    connTimeout: 30_000,
    authTimeout: 60_000,
  });

  imap.on("ready", () => {
    console.log("✅ IMAP READY");
  });

  imap.on("error", (err: Error) => {
    console.log("❌ IMAP ERROR", err);
  });

  imap.on("end", () => {
    console.log("🔚 IMAP CLOSED");
  });

  return imap;
}

/**
 * Safely end an IMAP connection, ignoring errors that occur during cleanup.
 */
function safeEnd(imap: Imap): void {
  try {
    if (imap && imap.state !== "disconnected") {
      imap.end();
    }
  } catch (err) {
    console.log("⚠️ Error while ending IMAP connection:", err instanceof Error ? err.message : err);
  }
}

/**
 * Convert a mailparser ParsedMail into our public ParsedEmail shape.
 */
function toParsedEmail(mail: ParsedMail): ParsedEmail {
  return {
    headers: mail.headers,
    subject: mail.subject,
    from: mail.from,
    to: mail.to,
    cc: mail.cc,
    bcc: mail.bcc,
    date: mail.date,
    messageId: mail.messageId,
    inReplyTo: mail.inReplyTo,
    references: mail.references,
    text: mail.text,
    html: mail.html,
    attachments: mail.attachments ?? [],
    raw: mail,
  };
}

/**
 * Read every UNSEEN message from the INBOX, parse them completely,
 * and return the full array. The IMAP connection is always closed
 * whether the operation succeeds or fails.
 */
export async function readInbox(config: IMAPConfig): Promise<ParsedEmail[]> {
  console.log("📥 Reading inbox");

  const imap = await createIMAPConnection(config);

  // Guarantee that the connection is always terminated.
  let settled = false;
  const settle = (fn: () => void) => {
    if (settled) return;
    settled = true;
    fn();
  };

  return new Promise<ParsedEmail[]>((resolve, reject) => {
    const emails: ParsedEmail[] = [];
    const parsePromises: Promise<void>[] = [];

    const cleanupAndResolve = (result: ParsedEmail[]) => {
      settle(() => {
        safeEnd(imap);
        resolve(result);
      });
    };

    const cleanupAndReject = (err: unknown) => {
      settle(() => {
        safeEnd(imap);
        reject(err instanceof Error ? err : new Error(String(err)));
      });
    };

    // Handle connection-level errors once.
    imap.once("error", (err: Error) => {
      console.log("❌ IMAP connection error:", err.message);
      cleanupAndReject(err);
    });

    imap.once("ready", () => {
      console.log("🔗 IMAP ready – opening INBOX");

      imap.openBox("INBOX", false, (openErr) => {
        if (openErr) {
          console.log("❌ Failed to open INBOX:", openErr.message);
          cleanupAndReject(openErr);
          return;
        }

        console.log("🔎 Searching unread");

        imap.search(["UNSEEN"], (searchErr, results) => {
          if (searchErr) {
            console.log("❌ Search failed:", searchErr.message);
            cleanupAndReject(searchErr);
            return;
          }

          const uids = results ?? [];
          console.log("Unread count:", uids.length);

          if (uids.length === 0) {
            console.log("✅ Empty inbox – returning []");
            cleanupAndResolve([]);
            return;
          }

          console.log(`📩 Processing ${uids.length} unread emails`);

          const fetch = imap.fetch(uids, {
            bodies: "",
            markSeen: true,
          });

          fetch.on("message", (msg, seqno) => {
            console.log(`📨 Receiving message seqno=${seqno}`);

            // Collect the full body stream before parsing.
            const bodyChunks: Buffer[] = [];

            msg.on("body", (stream) => {
              stream.on("data", (chunk: Buffer) => {
                bodyChunks.push(chunk);
              });

              stream.once("end", () => {
                const raw = Buffer.concat(bodyChunks);

                const parsePromise = simpleParser(raw)
                  .then((mail) => {
                    console.log("📨 Parsed:", mail.subject ?? "(no subject)");
                    emails.push(toParsedEmail(mail));
                  })
                  .catch((parseErr) => {
                    // Log but do not fail the whole batch for a single bad message.
                    console.log(
                      "⚠️ Failed to parse message:",
                      parseErr instanceof Error ? parseErr.message : parseErr
                    );
                  });

                parsePromises.push(parsePromise);
              });

              stream.once("error", (streamErr) => {
                console.log(
                  "⚠️ Body stream error:",
                  streamErr instanceof Error ? streamErr.message : streamErr
                );
              });
            });

            msg.once("error", (msgErr) => {
              console.log(
                "⚠️ Message error:",
                msgErr instanceof Error ? msgErr.message : msgErr
              );
            });
          });

          fetch.once("error", (fetchErr) => {
            console.log("❌ Fetch error:", fetchErr.message);
            cleanupAndReject(fetchErr);
          });

          fetch.once("end", () => {
            console.log("📦 Fetch ended – waiting for all parsers to finish");

            // Wait until every simpleParser promise has settled.
            Promise.all(parsePromises)
              .then(() => {
                console.log("✅ Returning emails:", emails.length);
                cleanupAndResolve(emails);
              })
              .catch((err) => {
                // Should be rare – individual parse errors are already caught.
                console.log("❌ Unexpected error while waiting for parsers:", err);
                cleanupAndReject(err);
              });
          });
        });
      });
    });

    console.log("🔗 Connecting...");
    try {
      imap.connect();
    } catch (connectErr) {
      console.log("❌ imap.connect() threw:", connectErr);
      cleanupAndReject(connectErr);
    }
  });
}