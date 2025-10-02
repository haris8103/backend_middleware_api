import Router from "koa-router";
import fs from "fs";
import { apiRequest, apiRequestSystem } from "../../helpers/apicall.mjs";
import checkCookie from "../../helpers/auth.mjs";
import multer from "@koa/multer";
import path from "path";
import { handleImageUpload } from "../../helpers/uploadImage.mjs";
import { useCookie } from "../../helpers/constants.mjs";

const router = new Router();
const BASE_URL = `/v1/file`;

// Configure multer for file upload
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, '/tmp/uploads/');
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    // Allow images and common document types
    const allowedTypes = /jpeg|jpg|png|gif|pdf|doc|docx/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (extname && mimetype) {
      return cb(null, true);
    }
    cb(new Error('Invalid file type. Only images and documents are allowed.'));
  }
});

// ********************* //
// Upload File
// ********************* //
router.post(`${BASE_URL}/upload`, async (ctx) => {
  try {
    const { user_cookie, cookie: _cookie } = ctx.request.headers;
    const cookie = user_cookie || useCookie(_cookie);
    const user = cookie && await checkCookie({ cookie });

    if (!user) {
      ctx.status = 401;
      ctx.body = "Unauthorized";
      return;
    }



    // Get user ID
    const { users: userData } = await apiRequestSystem(`
      query {
        users(filter: { profile_id: { _eq: "${user.profileId}" } }) {
          id
        }
      }
    `);

    if (!userData || userData.length === 0) {
      ctx.status = 400;
      ctx.body = "User not found";
      return;
    }
    const { files } = ctx.request.body;
    if (!files.file) {
      ctx.status = 400;
      ctx.body = "No file uploaded";
      return;
    }

    // Create file in Directus
    const imageUlpload = await handleImageUpload(
      fs.createReadStream(files.file.path),
      false,
      "Files"
    );

    // Delete temp file
    fs.unlinkSync(files.file.path);

    ctx.status = 201;
    ctx.body = imageUlpload;
  } catch (err) {
    console.error('Error uploading file:', err);
    ctx.status = err.response?.status || 500;
    ctx.body = err.response?.data || "Internal Server Error";
  }
});

// ********************* //
// Get File Info
// ********************* //
router.get(`${BASE_URL}/:fileId`, async (ctx) => {
  try {
    const { user_cookie } = ctx.request.headers;
    const cookie = user_cookie;
    const user = cookie && await checkCookie({ cookie });

    if (!user) {
      ctx.status = 401;
      ctx.body = "Unauthorized";
      return;
    }

    const fileId = ctx.params.fileId;

    const { files_by_id: fileData } = await apiRequestSystem(`
      query {
        files_by_id(id: "${fileId}") {
          id
          title
          filename_download
          type
          filesize
          created_by
        }
      }
    `);

    if (!fileData) {
      ctx.status = 404;
      ctx.body = "File not found";
      return;
    }

    ctx.status = 200;
    ctx.body = fileData;
  } catch (err) {
    ctx.status = err.response?.status || 500;
    ctx.body = err.response?.data || "Internal Server Error";
  }
});

export default router;
