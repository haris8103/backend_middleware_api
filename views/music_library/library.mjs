import Router from "koa-router";
import axios from "axios";
import { apiRequest, apiRequestSystem } from "../../helpers/apicall.mjs";
import checkCookie from "../../helpers/auth.mjs";
import { useMixpanel } from "../../helpers/mixpanel.mjs";

const url = process.env.DIRECTUS_BACKEND ?? "https://loop-markets.directus.app";
const router = new Router();
const BASE_URL = `/v1/music`;
const { sendMixpanel } = useMixpanel();

const wmaYear = (numbter) => {
  return 2023 + numbter;
}

// ********************* //
// All Tracks - Library
// ********************* //
router.get(`${BASE_URL}/library`, async (ctx) => {
  const { user_cookie } = ctx.request.headers;
  const cookie = user_cookie;
  try {
    // Check JWT
    const userData = await checkCookie({ cookie });

    // Check Cookie is present
    if (!cookie || !userData) {
      ctx.status = 401;
      ctx.body = "Unauthorized";
      return;
    }

    // get user wallet address
    const { users } = await apiRequestSystem(`
      query {
        users(filter: { profile_id: { _eq: "${userData.profileId}" } }) {
          wallet_address
        }
      }`);

    // Get tracks from collection owned by user
    const collectionQuery = `
      query {
        fans_nfts(
          filter: {
            owner: { _eq: "${users[0].wallet_address}" }
            collection: { collection_album: { id: { _nnull: true } } }
          }, limit: -1) {
          collection {
            id
          }
        }
      }
    `;
    const { fans_nfts } = await apiRequest(collectionQuery);

    const collectionIds = fans_nfts.map((nft) => nft.collection.id);
    const { collection_album } = await apiRequest(`
      query {
        collection_album(filter: { collection: { id: { _in: "${collectionIds}" } } } ) {
          tracks {
            file: directus_files_id {
              id
              title
            }
          }
          collection {
            banner {
              id
            }
            artist {
              avatar {
                id
              }
              first_name
              username
            }
          }
        }
      }
    `);

    const tracks = collection_album.map((album) => {
      return album.tracks.map((track) => {
        return {
          track: {
            id: track.file.id,
            title: track.file.title,
            artwork: album.collection.banner.id,
            artist: {
              name: album.collection.artist?.first_name,
              username: album.collection.artist?.username,
              avatar: album.collection.artist?.avatar?.id,
            },
          },
        };
      });
    });

    ctx.status = 200;
    ctx.body = tracks.flat();
    return;
  } catch (err) {
    //console.log(err, ctx);
    ctx.status = err.response.status;
    ctx.body = err.response.data;
    return;
  }
});



// ********************* //
// All Albums
// ********************* //
router.get(`${BASE_URL}/albums`, async (ctx) => {
  const { user_cookie } = ctx.request.headers;
  const cookie = user_cookie;
  try {
    // Check JWT
    const userData = await checkCookie({ cookie });

    // Check Cookie is present
    if (!cookie || !userData) {
      ctx.status = 401;
      ctx.body = "Unauthorized";
      return;
    }

    // get user wallet address
    const { users } = await apiRequestSystem(`
      query {
        users(filter: { profile_id: { _eq: "${userData.profileId}" } }) {
          wallet_address
        }
      }`);

    // Fetch Collections owned by user
    const collectionQuery = `
      query {
        fans_nfts(
          filter: {
            owner: { _eq: "${users[0].wallet_address}" }
            collection: { collection_album: { id: { _nnull: true } } }
          }, limit: -1) {
          collection {
            id
          }
        }
      }
    `;
    const { fans_nfts } = await apiRequest(collectionQuery);

    // Fetch Albums
    const collectionIds = fans_nfts.map((nft) => nft.collection.id);
    const { collection_album } = await apiRequest(`
      query {
        collection_album(filter: { collection: { id: { _in: "${collectionIds}" } } } ) {
          album_name: name
          tracks {
            file: directus_files_id {
              id
              title
            }
          }
          collection {
            id
            banner {
              id
            }
            artist {
              avatar {
                id
              }
              first_name
              display_name
              username
            }
            date_created
          }
        }
      }
    `);

    // FETCH WMA Tracks
    const { fans_nfts: wmaCollections } = await apiRequest(`
      query {
        fans_nfts(
          filter: {
            owner: { _eq: "${users[0].wallet_address}" }
            collection: {
              fans_launchpad_type: {
                launchpad_id: { collection_type: { _eq: "vote" } }
              }
            }
          }
        ) {
          id
          collection {
            artist {
              id
              username
              first_name
              avatar {
                id
              }
            }
            artowrk: banner {
              id
            }
            leaderboard {
              wma
            }
            song {
              id
              title
            }
          }
        }
      }
    `);

    const albums = collection_album.map((album) => {
      return {
        album: {
          id: album.collection.id,
          name: album?.album_name || album.collection.title,
          artwork: album.collection.banner.id,
          artist: {
            name: album.collection.artist?.first_name,
            display_name: album.collection.artist?.display_name,
            username: album.collection.artist?.username,
            avatar: album.collection.artist?.avatar?.id,
          },
          //number of tracks
          number_of_tracks: album.tracks.length,
          tracks: album.tracks.map((track) => {
            return {
              id: track.file.id,
              title: track.file.title,
              artwork: album.collection.banner.id,
              artist: {
                name: album.collection.artist?.first_name,
                display_name: album.collection.artist?.display_name,
                username: album.collection.artist?.username,
                avatar: album.collection.artist?.avatar?.id,
              },
            };
          }),
          //get Year of release
          release_date: new Date(album.collection.date_created).getFullYear(),
        }
      };
    });

    // Create WMA Albums based on year of WMA
    if (wmaCollections.length > 0) {
      albums.push({
        album: {
          id: `wma${wmaYear(wmaCollections[0].collection.leaderboard.wma)}`,
          name: `Web3 Awards ${wmaYear(wmaCollections[0].collection.leaderboard.wma)}`,
          artwork: "335d7c07-a205-431d-a587-48cf66617e85",
          artist: {
            name: "Loop Fans",
            display_name: "Loop Fans",
            username: "loopfans",
            avatar: "335d7c07-a205-431d-a587-48cf66617e85",
          },
          number_of_tracks: wmaCollections.length,
          release_date: wmaYear(wmaCollections[0].collection.leaderboard.wma),
          tracks: wmaCollections?.map((track) => {
            return {
              id: track?.collection.song?.id,
              title: `${track?.collection.artist?.username ?? track?.collection.artist?.first_name} WMA-${wmaYear(wmaCollections[0].collection.leaderboard.wma)}`,
              artwork: track?.collection.artowrk?.id,
              artist: {
                name: track?.collection.artist?.first_name,
                display_name: track?.collection.artist?.username,
                username: track?.collection.artist?.username,
                avatar: track?.collection.artist?.avatar?.id,
              },
            };
          }),
        }
      });
    }
    ctx.status = 200;
    ctx.body = albums;
    return;
  } catch (err) {
    //console.log(err, ctx);
    ctx.status = err.response.status;
    ctx.body = err.response.data;
    return;
  }
});



// ********************* //
// All Tracks from Album by ID
// ********************* //
router.get(`${BASE_URL}/album/:id`, async (ctx) => {
  const { id } = ctx.params;
  const { user_cookie } = ctx.request.headers;
  const cookie = user_cookie;
  try {
    // Check JWT
    const userData = await checkCookie({ cookie });

    // Check Cookie is present
    if (!cookie || !userData) {
      ctx.status = 401;
      ctx.body = "Unauthorized";
      return;
    }

    // get user wallet address
    const { users } = await apiRequestSystem(`
      query {
        users(filter: { profile_id: { _eq: "${userData.profileId}" } }) {
          wallet_address
          id
        }
      }`);

    // Send Mixpanel Event
    sendMixpanel({
      event: `Viewed Album: ${id}`,
      data: {
        distinct_id: users[0].id,
        album_id: id,
        user_id: users[0].id,
      },
    });

    // CHECK IF WMA ALBUM
    if (id.startsWith("wma")) {
      const { fans_nfts: wmaCollections } = await apiRequest(`
        query {
          fans_nfts(
            filter: {
              owner: { _eq: "${users[0].wallet_address}" }
              collection: {
                fans_launchpad_type: {
                  launchpad_id: { collection_type: { _eq: "vote" } }
                }
              }
            }
          ) {
            id
            collection {
              artist {
                id
                username
                first_name
                avatar {
                  id
                }
              }
              artowrk: banner {
                id
              }
              leaderboard {
                wma
              }
              song {
                id
                title
              }
            }
          }
        }
      `);


      const tracks = wmaCollections?.map((track) => {
        return {
          track: {
            id: track?.collection.song?.id,
            title: `${track?.collection.artist?.username ?? track?.collection.artist?.first_name} WMA-${wmaYear(track?.collection?.leaderboard?.wma)}`,
            artwork: track?.collection.artowrk?.id,
            artist: {
              name: track?.collection.artist?.first_name,
              display_name: track?.collection.artist?.username,
              username: track?.collection.artist?.username,
              avatar: track?.collection.artist?.avatar?.id,
            },
          },
        };
      });

      ctx.status = 200;
      ctx.body = tracks;
      return;
    }

    // Fetch Collections owned by user
    const collectionQuery = `
      query {
        fans_nfts(
          filter: {
            owner: { _eq: "${users[0].wallet_address}" }
            collection: { id: { _eq: "${id}" } }
          }, limit: -1) {
          collection {
            id
          }
        }
      }
    `;

    const { fans_nfts } = await apiRequest(collectionQuery);

    // Fetch Albums
    const collectionIds = fans_nfts.map((nft) => nft.collection.id);
    const { collection_album } = await apiRequest(`
      query {
        collection_album(filter: { collection: { id: { _in: "${collectionIds}" } } } ) {
          tracks {
            file: directus_files_id {
              id
              title
            }
          }
          collection {
            banner {
              id
            }
            artist {
              avatar {
                id
              }
              first_name
              display_name
              username
            }
            date_created
          }
        }
      }
    `);

    const tracks = collection_album.map((album) => {
      return album.tracks.map((track) => {
        return {
          track: {
            id: track.file.id,
            title: track.file.title,
            artwork: album.collection.banner.id,
            artist: {
              name: album.collection.artist?.first_name,
              display_name: album.collection.artist?.display_name,
              username: album.collection.artist?.username,
              avatar: album.collection.artist?.avatar?.id,
            },
          },
        };
      });
    });

    ctx.status = 200;
    ctx.body = tracks.flat();
    return;
  } catch (err) {
    //console.log(err, ctx);
    ctx.status = err.response.status;
    ctx.body = err.response.data;
    return;
  }
});

export default router;
