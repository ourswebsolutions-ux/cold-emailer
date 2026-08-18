export function generateWarmupReply(){

  const replies = [
    "Thanks for your email. Hope you are doing well.",
    "Received your message. Have a great day.",
    "Thanks for reaching out."
  ];


  return replies[
    Math.floor(
      Math.random() * replies.length
    )
  ];

}