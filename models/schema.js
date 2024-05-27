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
    token: {
        type: JSON,
        required: true
    },
})
const User = mongoose.model('User', userSchema)
module.exports = User;