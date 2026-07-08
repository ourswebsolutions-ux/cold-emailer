import Imap from "imap";
import { simpleParser } from "mailparser";


export function createIMAPConnection(config: {
  host: string;
  port: number;
  username: string;
  password: string;
}) {


  return new Imap({

    user: config.username,

    password: config.password,

    host: config.host,

    port: config.port,

    tls: true,

    family: 4,

    tlsOptions: {
      rejectUnauthorized: false
    }

  });

}



export function readInbox(config:any) {


  return new Promise<any[]>((resolve,reject)=>{


    const imap = createIMAPConnection(config);


    const emails:any[] = [];


    imap.once("ready",()=>{


      imap.openBox(
        "INBOX",
        false,
        (err)=>{


          if(err){
            reject(err);
            return;
          }


          imap.search(
            [
              "UNSEEN"
            ],
            (err,results)=>{


              if(err){
                reject(err);
                return;
              }


              if(!results.length){

                imap.end();

                resolve([]);

                return;

              }



              const fetch =
                imap.fetch(results,{
                  bodies:""
                });



              fetch.on(
                "message",
                (msg)=>{


                  msg.on(
                    "body",
                    (stream)=>{


                      simpleParser(
                        stream,
                        (err,mail)=>{

                          if(!err){

                            emails.push(mail);

                          }

                        }
                      );


                    }
                  );


                }
              );


              fetch.once(
                "end",
                ()=>{

                  imap.end();

                  resolve(emails);

                }
              );


            }
          );


        }
      );


    });



    imap.once(
      "error",
      reject
    );


    imap.connect();


  });

}
