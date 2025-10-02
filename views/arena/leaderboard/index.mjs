import Router from "koa-router";
import axios from "axios";
import dotenv from "dotenv";
import cache from "../../../helpers/cache.mjs";
import {
  default_host,
  gethostCreatorRole,
  logtail,
  platform,
} from "../../../helpers/constants.mjs";
import { apiRequest } from "../../../helpers/apicall.mjs";
import checkCookie from "../../../helpers/auth.mjs";
import { fetchUserId } from "../../../hooks/userHooks.mjs";

dotenv.config();
const router = new Router();
const BASE_URL = `/v1/arena/leaderboard`;

/* =================== */
// Fetch My Leaderboards
/* =================== */
router.get(`${BASE_URL}/me`, async (ctx) => {
  try {
    const { user_cookie } = ctx.request.headers;
    const cookie = user_cookie;

    // Check JWT
    const userData = cookie && (await checkCookie({ cookie }));

    // Check Cookie is present
    if (!cookie || !userData) {
      ctx.status = 401;
      ctx.body = "Unauthorized";
      return;
    }

    // User ID
    const userId = await fetchUserId({ profileID: userData.profileId });

    if (!userId) {
      ctx.status = 401;
      ctx.body = "Unauthorized";
      return;
    }

    // Leaderboard Query
    const leaderboardQuery = `
      query {
        leaderboards(
          filter: {
            collections: {
              artist: { id: { _eq: "${userId}" } }
            }
          }
        ) {
          id
          name
          division {
            id
            name
          }
          genre {
            id
            name
          }
        }
      }
    `;

    // Fetch Leaderboard
    const { leaderboards } = await apiRequest(leaderboardQuery);

    // Launchpad Query
    const launchpadQuery = `
      query {
        fans_launchpad(
          filter: {
            artist: { id: { _eq: "${userId}" } }
            collection_type: {
              _eq: "vote"
            }
          }
        ) {
          id
          project_name
          project_slug
          banner {
            id
          }
          launchpad_type {
            fan_collection {
              leaderboard {
                id
              }
            }
          }
        }
      }
    `;

    // Fetch Launchpad
    const { fans_launchpad: launchpad } = await apiRequest(launchpadQuery);
    const userLeaderboards = [];
    leaderboards.map((leaderboard) => {
      userLeaderboards.push({
        leaderboard: leaderboard,
        launchpad: {
          id: launchpad.find(
            (lp) =>
              lp.launchpad_type[0].fan_collection.leaderboard.id ===
              leaderboard.id
          )?.id,
          name: launchpad.find(
            (lp) =>
              lp.launchpad_type[0].fan_collection.leaderboard.id ===
              leaderboard.id
          )?.project_name,
          slug: launchpad.find(
            (lp) =>
              lp.launchpad_type[0].fan_collection.leaderboard.id ===
              leaderboard.id
          )?.project_slug,
          banner: launchpad.find(
            (lp) =>
              lp.launchpad_type[0].fan_collection.leaderboard.id ===
              leaderboard.id
          )?.banner,
        },
      });
    });

    ctx.status = 200;
    ctx.body = userLeaderboards;
    return;
  } catch (err) {
    ctx.status = 500;
    ctx.body = { artist_leaderboard: err.message };
    logtail.error(`Error fetching artist leaderboard: ${err.message}`);
    return;
  }
});

/* =================== */
// Fetch Latest Leaderboard
/* =================== */
router.get(`${BASE_URL}/latest`, async (ctx) => {
  const { limit, page } = ctx.request.query;

  try {
    // Fetch Genres
    const { genres: geners } = await apiRequest(`
      query {
        genres {
          id
          name
        }
      }
    `);

    // Fetch Divisions
    const { divisions: divisions } = await apiRequest(`
      query {
        divisions {
          id
          name
        }
      }
    `);

    const collections = [];
    const promises = geners.map(async (genre) => {
      const { fans_collections: fans_collections } = await apiRequest(`
      query {
        fans_collections(
          filter: {
            fans_launchpad_type: {
							launchpad_id: {
								collection_type: { _eq: "vote"}
							}
						}
            leaderboard: {
							genre: { name: {
								_eq: "${genre.name}"
							}}
              division: { name: {
								_eq: "${divisions[0].name}"
							}}
						}
          }
          sort: ["-date_created"],
          limit: ${limit},
          page: ${page}
        ) {
          id
          date_created
          song {
            id
          }
          artist {
            id
            first_name
            display_name
            username
            avatar { id }
          }
          leaderboard {
            id
            name
            division {
              id
              name
            }
            genre {
              id
              name
            }
          }
        }
      }
    `);
      collections.push(...fans_collections);
    });

    // Wait for all promises to resolve
    await Promise.all(promises);

    // sort by date_created latest first
    collections.sort(
      (a, b) => new Date(b.date_created) - new Date(a.date_created)
    );

    ctx.status = 200;
    ctx.body = collections;
    return;
  } catch (err) {
    ctx.status = 500;
    ctx.body = err.message;
    logtail.error(`Error fetching Leaderboards: ${err.message}`);
    return;
  }
});

/* =================== */
// Fetch Leaderboard List
/* =================== */
router.get(
  `${BASE_URL}/list/:genreId/:divisionId/:limit/:page`,
  async (ctx) => {
    try {
      const { genreId, divisionId, limit, page } = ctx.params;

      // Leaderboard Query
      const leaderboardQuery = `
      query { 
        leaderboards(
          filter: { genre: { id: { _eq: "${genreId}" } }, division: { id: { _eq: "${divisionId}" } } }
        ) {
          id
        }
      }
    `;

      // Fetch Leaderboard
      const { leaderboards: leaderboard } = await apiRequest(leaderboardQuery);

      // sort by randomness
      const sortList = [
        "artist.first_name",
        "-artist.first_name",
        "artist.username",
        "-artist.username",
        "name",
        "-name",
        "date_created",
        "-date_created",
        "-id",
        "id",
      ];
      const sort = sortList[Math.floor(Math.random() * sortList.length)];

      // Artist Query
      const artistQuery = `
      query {
        fans_collections(
          filter: { 
          fans_launchpad_type: {
            launchpad_id: { status: { _eq: "published" }  }
          }
          leaderboard: {
            id: {
              _eq: "${leaderboard[0].id}"
            }
          } }
          sort: ["${sort}"]
          page: ${page},
          limit: ${limit}
        ) {
          id
          date_created
          song {
            id
          }
          artist {
            id
            first_name
            display_name
            username
            description
            avatar { id }
          }
          launchpad: fans_launchpad_type {
            info: launchpad_id {
              id
              name: project_name
              slug: project_slug
              image: banner {
                id
              }
            }
          }
        }
      }
    `;

      // Fetch Artist
      const { fans_collections: artists } = await apiRequest(artistQuery);
      // sort by date_created latest first
      artists.sort(
        (a, b) => new Date(b.date_created) - new Date(a.date_created)
      );

      ctx.status = 200;
      ctx.body = artists;
      return;
    } catch (err) {
      ctx.status = 500;
      ctx.body = { artist_leaderboard: err.message };
      logtail.error(`Error fetching artist leaderboard: ${err.message}`);
      return;
    }
  }
);

/* =================== */
// Fetch Leaderboard Results
/* =================== */
router.get(
  `${BASE_URL}/results/:genreId/:divisionId/:limit/:page`,
  async (ctx) => {
    try {
      const { divisionId, limit, page } = ctx.params;
      const prizeData = [
        {
          division: 6,
          1: "$10,000",
          2: "$5,000",
          3: "$2,500",
          4: "$1,500",
          5: "$1,000",
        },
        {
          division: 5,
          1: "$10,000",
          2: "$5,000",
          3: "$2,500",
          4: "$1,500",
          5: "$1,000",
        },
        {
          division: 4,
          1: "$7,500",
          2: "$4,000",
          3: "$2,000",
          4: "$1,000",
          5: "$500",
        },
        {
          division: 3,
          1: "$7,500",
          2: "$4,000",
          3: "$2,000",
          4: "$1,000",
          5: "$500",
        },
        {
          division: 2,
          1: "$5,000",
          2: "$2,500",
          3: "$1,500",
          4: "$750",
          5: "$250",
        },
        {
          division: 1,
          1: "$5,000",
          2: "$2,500",
          3: "$1,500",
          4: "$750",
          5: "$250",
        },
      ];

      // Query All Collections for the leaderboard
      // filter by number of NFT owners > 0
      const collectionsQuery = `
      query {
        leaderboard_votes(filter: {
          division: {
            id: {
              _eq: "${divisionId}"
            }
          }
          user: {
            id: {
              _nin: ["1bd076a7-64ec-4659-a36f-b620f0ace61b", "fc11abe6-e8ed-4092-9ccf-1f5e3325e56c"]}
          }
          votes: {
            _gt: 0
          }
        }
        sort: ["-votes"]
        limit: ${limit}
        page: ${page}
        ) {
          artist: user {
            first_name
            display_name
            username
            avatar {
              id
            }
          }
          votes
        }
      }
    `;

      // Fetch Collections
      const { leaderboard_votes: votes } = await apiRequest(collectionsQuery);
      // Prize Data
      if (page === "1") {
        // first 5 then add Prize Pool to the rest
        const firstFive = votes.slice(0, 5);
        const rest = votes.slice(5);
        firstFive.map((vote, index) => {
          vote.prize_value = prizeData.find(
            (prize) => prize.division === parseInt(divisionId)
          )[index + 1];
        });
        rest.map((vote) => {
          vote.prize_value = "Prize Pool";
        });
      } else {
        votes.map((vote) => {
          vote.prize_value = "Prize Pool";
        });
      }

      ctx.status = 200;
      ctx.body = votes;
      return;
    } catch (err) {
      ctx.status = 500;
      ctx.body = { artist_leaderboard: err.message };
      logtail.error(`Error fetching artist leaderboard: ${err.message}`);
      return;
    }
  }
);

export default router;
