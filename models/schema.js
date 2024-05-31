const mongoose = require('mongoose')
const Schema = mongoose.Schema

// const blogSchema = new Schema({
//     title: {
//         type: String,
//         required: true
//     },
//     snippet: {
//         type: String,
//         required: true
//     },
//     body: {
//         type: String,
//         required: true
//     }
// }, { timestamps: true});
// 
// const Blog = mongoose.model('Blog', blogSchema)
// module.exports = Blog;


const userSchema = new Schema({
    name: {
        type: String,
        required: true
    },
    email: {
        type: String,
        required: true,
        unique: true
    },
    refresh_token: {
        type: String,
        required: false // Optional since refresh token might not be immediately available
    }
});
const User = mongoose.model('User', userSchema)
module.exports = User;