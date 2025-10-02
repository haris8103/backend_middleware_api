import Joi from "joi";

/* =================== */
/* === Validation === */
/* =================== */

/* === Vote Collection Creation === */
export const voteCollectionSchema = Joi.object({
  cookie: Joi.string().required(),
  divisionId: Joi.string().required(),
  genreId: Joi.string().required(),
  status: Joi.string(),
});

/* === Support Collection Creation === */
export const supportCollectionSchema = Joi.object({
  cookie: Joi.string().required(),
});

/* === Support Collection Creation === */
export const createCollectionSchema = Joi.object({
  cookie: Joi.string().required(),
  collection: Joi.string().required(),
});

/* === UserInfo === */
const userInfo = Joi.object({
  id: Joi.string().required(),
  role: Joi.string().required(),
  profile_id: Joi.string().required(),
  avatar: Joi.any().required(),
  first_name: Joi.string().required(),
  display_name: Joi.any(), // Optional
  username: Joi.any(),
  onboard: Joi.boolean(),
  wallet_address: Joi.string().required(),
  wallet: Joi.object(),
});

/* === Feed === */
export const feedSchema = Joi.object({
  page: Joi.number().integer().required(),
  userInfo: userInfo.required(),
  forYou: Joi.boolean(),
});

/* === Comments === */
export const commentsSchema = Joi.object({
  post_id: Joi.number().integer().required(),
});

/* === Comment === */
export const commentSchema = Joi.object({
  cookie: Joi.string().required(),
  userInfo: userInfo.required(),
  post_id: Joi.number().integer().required(),
  comment: Joi.string().trim().required(),
});

/* === Like === */
export const likeSchema = Joi.object({
  cookie: Joi.string().required(),
  userInfo: userInfo.required(),
  post_id: Joi.number().integer().required(),
});

/* === Like === */
export const profileUpdateSchema = Joi.object({
  cookie: Joi.string().required(),
  user_id: Joi.string().required(),
  profile_id: Joi.string().required(),
  profile_displayName: Joi.string(),
  profile_description: Joi.string().empty(""),
  profile_about: Joi.string().empty(""),
  profile_username: Joi.string().empty(""),
  profile_avatar: Joi.any(),
  profile_background: Joi.any(),
  profile_socials: Joi.any(),
  profile_featured_song: Joi.any(),
  profile_location: Joi.string().empty(""),
  profile_show_featured_song: Joi.boolean(),
  profile_onboard: Joi.boolean(),
  profile_type: Joi.string().empty(""),

});
