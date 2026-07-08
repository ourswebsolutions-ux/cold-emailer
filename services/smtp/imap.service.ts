import Imap from "imap";
import { simpleParser } from "mailparser";
import dns from "node:dns/promises";


async function resolveGmailIMAP() {

  try {

    const result = await dns.lookup(
      "imap.gmail.com",
      {
        family:4
      }
    );

    console.log(
      "✅ Gmail IP:",
      result.address
    );

    return result.address;


  } catch(error){

    console.log(
      "⚠️ DNS failed using fallback"
    );

    return "74.125.68.109";

  }

}



export async function createIMAPConnection(config:any){


  const ip = await resolveGmailIMAP();


  console.log(
    "🚀 Creating IMAP",
    {
      ip,
      user:config.username
    }
  );


  const imap = new Imap({

    user:config.username,

    password:config.password,

    host:ip,

    port:993,

    tls:true,

    tlsOptions:{
      servername:"imap.gmail.com",
      rejectUnauthorized:true
    },

    connTimeout:30000,

    authTimeout:60000

  });



  imap.on(
    "ready",
    ()=>{
      console.log(
        "✅ IMAP READY"
      );
    }
  );


  imap.on(
    "error",
    err=>{
      console.log(
        "❌ IMAP ERROR",
        err
      );
    }
  );


  imap.on(
    "end",
    ()=>{
      console.log(
        "🔚 IMAP CLOSED"
      );
    }
  );


  return imap;

}





export async function readInbox(config:any){


  console.log(
    "📥 Reading inbox"
  );


  const imap =
    await createIMAPConnection(config);



  return new Promise<any[]>(
    (resolve,reject)=>{


      const emails:any[]=[];



      imap.once(
        "ready",
        ()=>{


          imap.openBox(
            "INBOX",
            false,
            (err)=>{


              if(err){
                reject(err);
                return;
              }



              console.log(
                "🔎 Searching unread"
              );



              imap.search(
                [
                  "UNSEEN"
                ],
                (err,results)=>{


                  if(err){
                    reject(err);
                    return;
                  }



                  console.log(
                    "Unread count:",
                    results.length
                  );



                  if(!results.length){

                    imap.end();

                    resolve([]);

                    return;

                  }



                  const uid =
                    results[results.length-1];



                  console.log(
                    "📩 Latest UID:",
                    uid
                  );



                  const fetch =
                    imap.fetch(
                      [uid],
                      {
                        bodies:""
                      }
                    );



                  fetch.on(
                    "message",
                    msg=>{


                      msg.on(
                        "body",
                        stream=>{


                          simpleParser(
                            stream
                          )
                          .then(mail=>{


                            console.log(
                              "📨 Parsed:",
                              mail.subject
                            );


                            emails.push(mail);


                          })
                          .catch(console.log);


                        }
                      );


                    }
                  );



                  fetch.once(
                    "end",
                    ()=>{


                      setTimeout(
                        ()=>{


                          console.log(
                            "✅ Returning emails:",
                            emails.length
                          );


                          imap.end();


                          resolve(emails);


                        },
                        1000
                      );


                    }
                  );



                }
              );



            }
          );


        }
      );



      imap.once(
        "error",
        reject
      );



      console.log(
        "🔗 Connecting..."
      );


      imap.connect();


    }
  );

}