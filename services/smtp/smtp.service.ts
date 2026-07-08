import nodemailer from "nodemailer";

interface SendEmailParams {
  host: string;
  port: number;
  username: string;
  password: string;

  from: string;
  fromName?: string;

  to: string;

  subject: string;
  text: string;
}


export async function sendSMTPEmail(
  data: SendEmailParams
) {

  const transporter =
    nodemailer.createTransport({

      host: data.host,
      port: data.port,
      secure: data.port === 465,

      auth: {
        user: data.username,
        pass: data.password
      }

    });


  await transporter.sendMail({

    from: {
      name: data.fromName || "Warmup",
      address: data.from
    },

    to: data.to,

    subject: data.subject,

    text: data.text

  });


  console.log(
    `Warmup mail sent ${data.from} -> ${data.to}`
  );

}