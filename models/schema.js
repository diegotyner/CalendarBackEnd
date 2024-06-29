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

const CalendarEntrySchema = new mongoose.Schema({
    kind: { type: String, required: true },
    etag: { type: String, required: true },
    id: { type: String, required: true },
    summary: { type: String, required: true },
    timeZone: { type: String, required: true },
    colorId: { type: String },
    backgroundColor: { type: String },
    foregroundColor: { type: String },
    selected: { type: Boolean, default: true },
    accessRole: { type: String, required: true },
  });

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
    },
    burpee_count: {
        type: Number,
        required: true
    },
    burpee_date: {
        type: String,
        required: true
    },
    calendarList: [CalendarEntrySchema]
});
const User = mongoose.model('User', userSchema)
module.exports = User;