const nodemailer = require('nodemailer')
const sendEmail=async(option)=>{
    let transporter = nodemailer.createTransport({
        host:process.env.SMTP_HOST,
        port:process.env.SMTP_PORT,
        service:process.env.SMTP_SERVICE,
        auth:{
            user:process.env.SMTP_EMAIL,
            pass:process.env.SMTP_PASSWORD,
        },
        tls:{
            rejectUnauthorized:false
        }
    })

    const mailOption = {
        from:process.env.SMTP_EMAIL,
        to:option.email,
        subject:option.subject,
        text:option.message
    }

    await transporter.sendMail(mailOption)
}
module.exports = sendEmail;