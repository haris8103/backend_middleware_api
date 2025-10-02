import dotenv from "dotenv";
import Router from "koa-router";
import { getClient } from '@umami/api-client';
import { apiRequest, apiRequestSystem } from "../../helpers/apicall.mjs";
import { getFieldByUserId } from "../../helpers/userAccount.mjs";

dotenv.config();
const router = new Router();
const BASE_URL = `/v1/umami`;

const client = getClient({
  userId: process.env.UMAMI_API_CLIENT_USER_ID,
  secret: process.env.UMAMI_API_CLIENT_SECRET,
  apiEndpoint: process.env.UMAMI_API_CLIENT_ENDPOINT
});

// Helper function to fetch user's domain
const getUserDomain = async (userId) => {
  try {
    const { domains } = await apiRequest(`
      query {
        domains(filter: { owner_id: { id: { _eq: "${userId}" } } }) {
          domain
          custom_domain
        }
      }
    `);

    if (domains && domains.length > 0) {
      // Prefer custom_domain if it exists, otherwise use domain
      return domains[0].custom_domain || domains[0].domain;
    }

    return null;
  } catch (error) {
    console.error('Error fetching user domain:', error);
    return null;
  }
};

// ********************* //
// Dashboard API
// GET /v1/umami/stats/range
// Query Parameters:
// - host (required): The domain/hostname to filter analytics for (e.g., "artist.loop.fans")
// - range: Time range (1h, 24h, 7d, 30d, 90d) - default: 24h
// - unit: Time unit for data points - default: hour
// - timezone: Timezone for data - default: America/New_York
// ********************* //
router.get(BASE_URL + '/stats/range', async (ctx) => {
  const { user_cookie } = ctx.request.headers;
  const cookie = user_cookie;

  try {
    const {
      websiteId = '4495ff02-15c6-476a-a97e-1d5f4585d292',
      range = '24h', // 24h, 7d, 30d, 90d
      unit = 'hour',
      timezone = 'America/New_York',
      host,
      compare = 'false'
    } = ctx.query;

    if (!host) {
      ctx.status = 400;
      ctx.body = {
        error: 'Missing required parameter: host is required'
      };
      return;
    }

    // Calculate date range based on range parameter
    const now = new Date();
    const endAt = now.getTime();
    let startAt;

    switch (range) {
      case '1h':
        startAt = endAt - (1 * 60 * 60 * 1000);
        break;
      case '24h':
        startAt = endAt - (24 * 60 * 60 * 1000);
        break;
      case '7d':
        startAt = endAt - (7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        startAt = endAt - (30 * 24 * 60 * 60 * 1000);
        break;
      case '90d':
        startAt = endAt - (90 * 24 * 60 * 60 * 1000);
        break;
      default:
        ctx.status = 400;
        ctx.body = {
          error: 'Invalid range. Supported ranges: 1h, 24h, 7d, 30d, 90d'
        };
        return;
    }

    const response = await client.getWebsiteStats(websiteId, {
      startAt: startAt,
      endAt: endAt,
      unit,
      timezone,
      host,
      compare
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Umami API error:', response.status, errorText);
      ctx.status = response.status;
      ctx.body = {
        error: `Umami API error: ${response.status} ${response.statusText}`,
        details: errorText
      };
      return;
    }
    const websiteView = await client.getWebsitePageviews(websiteId, {
      startAt: startAt,
      endAt: endAt,
      unit,
      host,
      timezone,
      host,
    });

    const MetricsView = await client.getWebsiteMetrics(websiteId, {
      type: "url",
      startAt: startAt,
      endAt: endAt,
      host,
    });


    ctx.body = {
      success: true,
      // MetricsView:MetricsView.data,
      websiteView: websiteView.data,
      data: response.data,
      metadata: {
        websiteId,
        range,
        startAt,
        endAt,
        unit,
        timezone,
        host,
        compare
      }
    };
    return;

  } catch (error) {
    console.error('Error fetching Umami stats:', error);
    ctx.status = 500;
    ctx.body = {
      error: 'Internal server error',
      message: error.message
    };
  }
});

// ********************* //
// Dashboard Graph API + daily monthly views
// POST /v1/umami/graph/stats/range
// Body Parameters:
// - userInfo (required): User information object with id field
// - range (required): Time range (1h, 24h, 7d, 30d, 90d)
// - host (optional): Domain/hostname to filter analytics for. If not provided, will be auto-fetched from user's domain
// - unit: Time unit for data points - default: hour
// - timezone: Timezone for data - default: Asia/Karachi
// - device: Device type filter - default: all
// ********************* //
router.post(BASE_URL + '/graph/stats/range', async (ctx) => {
  const {
    websiteId = '4495ff02-15c6-476a-a97e-1d5f4585d292',
    range,
    unit = 'hour',
    timezone = 'Asia/Karachi',
    host,
    compare = 'false',
    userInfo,
    device
  } = ctx.request.body;

  if (!range) {
    ctx.status = 400;
    ctx.body = { error: 'Missing range in request body' };
    return;
  }

  // If host is not provided, try to fetch it from user's domain
  let finalHost = host;
  if (!host && userInfo?.id) {
    finalHost = await getUserDomain(userInfo.id);
    if (!finalHost) {
      ctx.status = 400;
      ctx.body = { error: 'Host parameter required or user domain not found' };
      return;
    }
  } else if (!host) {
    ctx.status = 400;
    ctx.body = { error: 'Missing host in request body' };
    return;
  }


  // getting user daily reviews from the time its created //
  const usersData = await apiRequestSystem(`
     query {
       users(filter: { profile_id: { _eq: "${userInfo.profile_id}" } }) {
         id
         create_date
       }
     }
   `);


  const userCreatedAt = new Date(usersData.users[0].create_date); // Access the date inside array
  const userStartDate = userCreatedAt.getTime();
  const userEndAt = Date.now();

  const userViews = await client.getWebsitePageviews(websiteId, {
    startAt: userStartDate,
    endAt: userEndAt,
    unit,
    timezone,
    host: finalHost,
  });


  const now = new Date();
  const endAt = now.getTime();
  let startAt, intervalSize, steps;

  switch (range) {
    case '1h':
      intervalSize = 60 * 60 * 1000;
      steps = 1;
      startAt = endAt - steps * intervalSize;
      break;
    case '24h':
      intervalSize = 60 * 60 * 1000;
      steps = 24;
      startAt = endAt - steps * intervalSize;
      break;
    case '7d':
      intervalSize = 24 * 60 * 60 * 1000;
      steps = 7;
      startAt = endAt - steps * intervalSize;
      break;
    case '30d':
      intervalSize = 24 * 60 * 60 * 1000;
      steps = 30;
      startAt = endAt - steps * intervalSize;
      break;
    case '90d':
      intervalSize = 24 * 60 * 60 * 1000;
      steps = 90;
      startAt = endAt - steps * intervalSize;
      break;
    default:
      ctx.status = 400;
      ctx.body = {
        error: 'Invalid range. Supported values: 1h, 24h, 7d, 30d, 90d'
      };
      return;
  }

  startAt = endAt - steps * intervalSize;

  ////////////////////////////////////  daily average view percentage   ////////////////////////////////////////////
  const prevEndAt = startAt;
  const prevStartAt = prevEndAt - steps * intervalSize;

  const baseParams = { unit, timezone, host: finalHost, ...(device !== 'all' && { device }) };

  // fetch current + previous in parallel
  const [currentRes, previousRes] = await Promise.all([
    client.getWebsitePageviews(websiteId, { startAt, endAt, ...baseParams }),
    client.getWebsitePageviews(websiteId, { startAt: prevStartAt, endAt: prevEndAt, ...baseParams }),
  ]);


  // extract arrays like: [{ x: '2025-08-01 00:00:00', y: 50 }, ...]
  const currentArr = currentRes?.data?.pageviews ?? [];
  const previousArr = previousRes?.data?.pageviews ?? [];

  // totals (sum of y)
  const currentTotal = currentArr.reduce((acc, p) => acc + (Number(p?.y) || 0), 0);
  const previousTotal = previousArr.reduce((acc, p) => acc + (Number(p?.y) || 0), 0);

  // % change
  const absoluteChange = currentTotal - previousTotal;
  let percentChange = 0;
  if (previousTotal !== 0) {
    percentChange = (absoluteChange / previousTotal) * 100;
  } else if (currentTotal > 0) {
    percentChange = 100;
  }



  // optional: index-aligned daily/hourly comparison (same length as the shorter array)
  const len = Math.min(currentArr.length, previousArr.length);
  const byIndex = Array.from({ length: len }, (_, i) => {
    const c = currentArr[i];
    const p = previousArr[i];
    const cy = Number(c?.y) || 0;
    const py = Number(p?.y) || 0;
    const change = py !== 0 ? ((cy - py) / py) * 100 : (cy > 0 ? 100 : 0);
    return {
      current: { x: c?.x, y: cy },
      previous: { x: p?.x, y: py },
      percentChange: change,
      absoluteChange: cy - py,
    };
  });

  /////////////////////////////////// daily average view percentage  ////////////////////////////////////////////

  try {
    const websiteView = await client.getWebsitePageviews(websiteId, {
      startAt,
      endAt,
      unit,
      host,
      timezone,
      host: finalHost,
      ...(device !== "all" && { device })
    });

    // Use only the pageviews array
    const rawData = Array.isArray(websiteView?.data?.pageviews)
      ? websiteView.data.pageviews
      : [];

    /////////////////  monthly growth graph  /////////////////////
    const completeData = [];
    function formatDate(date, unit) {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      if (unit === 'hour') {
        const hour = String(date.getHours()).padStart(2, '0');
        return `${year}-${month}-${day}T${hour}`;
      }
      return `${year}-${month}-${day}`;
    }

    for (let i = 0; i <= steps; i++) {
      const date = new Date(startAt + i * intervalSize);
      const key = formatDate(date, unit);

      const matched = rawData.find(item => {
        const itemDate = new Date(item.x);
        const itemKey = formatDate(itemDate, unit);
        return itemKey === key;
      });


      completeData.push({
        x: key,
        y: matched ? matched.y : 0
      });
    }



    intervalSize = 24 * 60 * 60 * 1000;
    steps = 30;
    const last30Days = endAt - steps * intervalSize;
    const pageviewsMonthly = await client.getWebsiteStats(websiteId, {
      startAt: last30Days,
      endAt,
      host: finalHost,
    });

    const totalDays = rawData.reduce((sum, day) => sum + day.y, 0);
    const count = completeData.length;
    const average = totalDays / count;


    const HOUR = 60 * 60 * 1000;
    const DAY = 24 * HOUR;
    const monthlySteps = 30;
    const monthlyEndAt = endAt; // must be ms since epoch
    const monthlyStartAt = monthlyEndAt - monthlySteps * DAY;
    const prevMonthlyEndAt = monthlyStartAt;
    const prevMonthlyStartAt = prevMonthlyEndAt - monthlySteps * DAY;

    const monthlyUnit = 'day';


    ctx.body = {
      averageDailyViewsPercentage: {
        absoluteChange,
        percentChange
      },
      currentRes,
      previousRes,
      success: true,
      viewsGraphs: completeData,
      pageviewsMonthly: pageviewsMonthly.data,
      averageDailyViews: average.toFixed(0),
      metadata: {
        websiteId,
        range,
        startAt,
        endAt,
        unit,
        timezone,
        host: finalHost,
        compare,
        readableRange: {
          start: new Date(startAt).toISOString(),
          end: new Date(endAt).toISOString()
        }
      }
    };
  } catch (error) {
    console.error(' Error fetching stats:', error);
    ctx.status = 500;
    ctx.body = {
      error: 'Internal server error',
      message: error.message
    };
  }
});


// ********************* //
// Fans Growths Graph
// ********************* //
router.post(BASE_URL + '/graph/fansGrowth', async (ctx) => {
  const { userInfo, collectionFilter } = ctx.request.body;
  const now = new Date();

  try {
    // Construct the GraphQL query dynamically to get fans/followers with date_created
    const fansFollowers = `
      query {
        fans_followers(
          filter: {
            follower_id: { id: { _eq: "${userInfo.id}" } }
          }
        ) {
          date_created
          user_id {
            id
            first_name
            create_date
            display_name
          }
        }
      }
    `;

    // Call the API with the query to get followers
    const userFans = await apiRequest(fansFollowers);
    console.log('userFans', userFans);

    // Directly use the userFans.fans_followers array
    const followers = userFans.fans_followers || [];

    // Prepare the list of followers by extracting the necessary fields
    const formattedFollowers = followers.map((follower) => ({
      id: follower.user_id.id,
      display_name: follower.user_id.display_name || "Anonymous", // Handle null display_name
      date_created: new Date(follower.date_created), // Use date_created for growth calculation
    }));

    // --- Calculate the monthly growth based on date_created ---
    let currentMonthNewFans = 0;

    // Function to count new followers per month based on date_created
    function countFollowersByMonth(followers) {
      const followersCountByMonth = {};
      const sorted = [...followers].sort(
        (a, b) => a.date_created - b.date_created
      );

      // Define last 6 months
      const last6Months = [];
      for (let i = 0; i < 6; i++) {
        const date = new Date();
        date.setMonth(now.getMonth() - i);
        const yearMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        last6Months.push(yearMonth); // Add all 6 months as keys
      }

      for (const follower of sorted) {
        const createdAt = follower.date_created;
        const yearMonth = `${createdAt.getFullYear()}-${String(createdAt.getMonth() + 1).padStart(2, '0')}`;

        // Only count followers from the last 6 months
        if (last6Months.includes(yearMonth)) {
          followersCountByMonth[yearMonth] = (followersCountByMonth[yearMonth] || 0) + 1;
        }
      }

      // Add missing months with 0 followers if not already in the object
      last6Months.forEach((month) => {
        if (!followersCountByMonth[month]) {
          followersCountByMonth[month] = 0;
        }
      });

      return followersCountByMonth
    }

    // Transform the follower data to monthly growth data
    function transformFollowerData(followersCountByMonth) {
      const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      const transformedData = Object.keys(followersCountByMonth).map((yearMonth) => {
        const [year, month] = yearMonth.split('-');
        const monthName = monthNames[parseInt(month, 10) - 1];
        return { month: monthName, year, newFollowers: followersCountByMonth[yearMonth] };
      });

      // Sort the array in ascending order based on the date
      transformedData.sort((a, b) => {
        const aDate = new Date(a.year, monthNames.indexOf(a.month));
        const bDate = new Date(b.year, monthNames.indexOf(b.month));
        return aDate - bDate;
      });

      return transformedData;
    }


    // Count followers by month
    const followersCountByMonth = countFollowersByMonth(formattedFollowers);
    const followerMonthlyGrowthData = transformFollowerData(followersCountByMonth);

    // Current month's new followers (first-time ever this month)
    {
      const y = now.getFullYear();
      const m = now.getMonth();

      const sorted = [...formattedFollowers].sort(
        (a, b) => a.date_created - b.date_created
      );
      const seen = new Set();

      for (const follower of sorted) {
        if (!seen.has(follower.id)) {
          const d = follower.date_created;
          if (d.getFullYear() === y && d.getMonth() === m) {
            currentMonthNewFans++; // first-ever follow this month
          }
          seen.add(follower.id);
        }
      }
    }

    const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthKey = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, '0')}`;

    const lastMonthNewFollowers = followersCountByMonth[lastMonthKey] ?? 0;
    const thisMonthNewFollowers = followersCountByMonth[currentMonthKey] ?? 0;

    let pctChangeMoM = 0;
    if (lastMonthNewFollowers === 0 && thisMonthNewFollowers === 0) {
      pctChangeMoM = 0;
    } else if (lastMonthNewFollowers === 0) {
      pctChangeMoM = Infinity; // No data last month, but data this month
    } else {
      const delta = thisMonthNewFollowers - lastMonthNewFollowers;
      pctChangeMoM = (delta / lastMonthNewFollowers) * 100;
    }

    // Send the response with the required data
    ctx.body = {
      currentMonthNewFans, // Current month's new followers
      followerMonthlyGrowthData, // Monthly growth data for followers
      pctChangeMoM, // Percentage change in new followers from last month to this month
      followers: formattedFollowers, // Return formatted followers data
    };
  } catch (err) {
    console.error("Error:", err);
    ctx.status = 500;
    ctx.body = { error: err.message };
  }
});


//----------------------------------------------------------------------------------------------//
const generateLaunchpadQuery = (userId) => `
  query {
    fans_launchpad(
      filter: {
        artist: { id: { _eq: "${userId}" } }
        
        project_status: { _neq: "completed" }
      }
    ) {
      id
      project_name
      project_slug
      project_status
      status
      banner {
        id
      }
      collection_type
      launchpad_type {
        collections_type {
          name
          desc
        }
        fan_collection {
          name
          description
          faqs { Questions }
        }
        benefits {
          benefit
        }
      }
    }
  }
`;

const generateArtistTotalNFTQuery = (userId) => `
  query {
    fans_nfts(filter: {collection: {artist: {id: {_eq: "${userId}"}}}}) {
      owner
      token_id
      collection {
        artist {
          id
          first_name
        }
      }
      name
      id
    }
  }
`;

const generateLaunchpadInfoQuery = (id) => `
  query {
    fans_launchpad(filter: {id: {_eq: "${id}"}}) {
      id
      artist {
        id
        first_name
        username
        display_name
        avatar { id }
      }
      launchpad_type {
        launchInfo {
          startDate
          startTime
          publicDate
          publicTime
          mintPrice
          mint_limit
          maxSupply
          minPrice
          NFT
          is_free
        }
        fan_collection {
          id
          name
          status
          description
          address
          collection_album {
            id
            name
            order
            genre {
              id
              name
            }
          }
        }
      }
    }
  }
`;

const fetchData = async (query) => {
  try {
    return await apiRequest(query);
  } catch (error) {
    console.error("Error fetching data:", error);
    return null;
  }
};

const calculateCompletionPercentage = (nftOwnerCount, maxSupply) => {
  return ((nftOwnerCount / maxSupply) * 100).toFixed(2);
};

const fetchFanCollectionData = async (collectionId) => {
  const query = `
    query {
      fans_collections(filter: { id: { _eq: "${collectionId}" } }) {
        id
        nfts {
          id
          owner
        }
      }
      fans_nfts_aggregated(filter: { collection: { id: { _eq: "${collectionId}" } } }) {
        count {
          owner
        }
      }
    }
  `;
  return fetchData(query);
};


// ********************* //
// Collection Graph
// ********************* //

router.post(`${BASE_URL}/graph/collections`, async (ctx) => {
  const { websiteId = '4495ff02-15c6-476a-a97e-1d5f4585d292', userInfo, collectionFilter } = ctx.request.body;
  try {
    // Fetch launchpad data
    const launchpadData = await fetchData(generateLaunchpadQuery(userInfo.id));
    const launchpadIds = launchpadData?.fans_launchpad?.map(lp => lp.id) || [];

    const collectedData = [];

    // Loop through the launchpad IDs and fetch data
    for (const id of launchpadIds) {
      const launchpadData = await fetchData(generateLaunchpadInfoQuery(id));
      if (launchpadData) {
        collectedData.push({ id, data: launchpadData });
      }
    }

    // Extract relevant data
    const extractedData = collectedData.map(item => {
      const launchpad = item.data?.fans_launchpad?.[0];
      if (!launchpad) return null;

      const launchInfo = launchpad.launchpad_type[0]?.launchInfo || {};
      const fanCollection = launchpad.launchpad_type[0]?.fan_collection || {};

      return {
        fanCollectionName: fanCollection.name || "N/A",
        id: launchpad.id,
        collectionId: fanCollection.id,
        maxSupply: launchInfo.maxSupply || "N/A",
        description: fanCollection.description || "N/A",
        mintPrice: launchInfo.mintPrice || "N/A",
        publicDate: launchInfo.publicDate || "N/A",
      };
    }).filter(item => item !== null);

    // Fetch fan collection data and calculate the percentage completion
    const fanCollectionResults = await Promise.all(
      extractedData.map(async (item) => {
        const collectionData = await fetchFanCollectionData(item.collectionId);
        const nftOwnerCount = collectionData?.fans_nfts_aggregated?.[0]?.count?.owner || 0;
        const maxSupply = parseInt(item.maxSupply, 10); // Ensure maxSupply is treated as a number
        const completionPercentage = calculateCompletionPercentage(nftOwnerCount, maxSupply);

        return {
          ...item,
          nftOwnerCount,
          maxSupply,  // Make sure maxSupply is a number
          completionPercentage: `${completionPercentage}%`,
        };
      })
    );

    // Calculate the overall completion percentage using the correct formula
    const totalNFTsSold = fanCollectionResults.reduce((sum, item) => sum + item.nftOwnerCount, 0);
    const totalMaxSupply = fanCollectionResults.reduce((sum, item) => {
      const maxSupply = parseInt(item.maxSupply, 10); // Ensure maxSupply is a number
      return sum + (isNaN(maxSupply) ? 0 : maxSupply);  // If maxSupply is invalid, treat it as 0
    }, 0);

    // console.log("totalMaxSupply", totalMaxSupply);  // This should now be a valid number
    // console.log("totalNFTsSold", totalNFTsSold);


    const overallCompletionPercentage = totalMaxSupply > 0
      ? ((totalNFTsSold / totalMaxSupply) * 100).toFixed(2)
      : "0";  // Avoid division by zero, return "0%" if totalMaxSupply is zero

    let sortedCollectionDetails;

    switch (collectionFilter) {
      case "all":
        // Sort by completion percentage (descending)
        sortedCollectionDetails = fanCollectionResults.sort((a, b) => {
          const percentageA = parseFloat(a.completionPercentage.replace('%', ''));
          const percentageB = parseFloat(b.completionPercentage.replace('%', ''));
          return percentageB - percentageA;
        });
        break;

      case "top":
        sortedCollectionDetails = fanCollectionResults
          .filter(item => parseFloat(item.completionPercentage.replace('%', '')) > 0)  // Exclude 0% completion
          .sort((a, b) => {
            const percentageA = parseFloat(a.completionPercentage.replace('%', ''));
            const percentageB = parseFloat(b.completionPercentage.replace('%', ''));
            return percentageB - percentageA;
          });
        break;

      case "recent":
        // Sort by publicDate (ascending, most recent first)
        sortedCollectionDetails = fanCollectionResults.sort((a, b) => {
          const dateA = new Date(a.publicDate);
          const dateB = new Date(b.publicDate);
          return dateB - dateA;  // Most recent first
        });
        break;

      default:
        sortedCollectionDetails = fanCollectionResults.sort((a, b) => {
          const percentageA = parseFloat(a.completionPercentage.replace('%', ''));
          const percentageB = parseFloat(b.completionPercentage.replace('%', ''));
          return percentageB - percentageA;
        });
        break;
    }

    ctx.status = 200;
    ctx.body = {
      collectionDetails: sortedCollectionDetails,
      overallCompletionPercentage: `${overallCompletionPercentage}%`,  // Add the overall completion percentage to the response
    };
  } catch (err) {
    ctx.status = 500;
    ctx.body = { error: err.message };
  }
});


// ********************* //
// Dashboard Graph
// POST /v1/umami/dashboard
// Body Parameters:
// - userInfo (required): User information object with id field
// - host (optional): Domain/hostname to filter analytics for. If not provided, will be auto-fetched from user's domain
// ********************* //
router.post(`${BASE_URL}/dashboard`, async (ctx) => {
  const { websiteId = '4495ff02-15c6-476a-a97e-1d5f4585d292', userInfo, collectionFilter, host } = ctx.request.body;

  // If host is not provided, try to fetch it from user's domain
  let finalHost = host;
  if (!host && userInfo?.id) {
    finalHost = await getUserDomain(userInfo.id);
    if (!finalHost) {
      ctx.status = 400;
      ctx.body = { error: 'Host parameter required or user domain not found' };
      return;
    }
  } else if (!host) {
    ctx.status = 400;
    ctx.body = { error: 'Missing host in request body' };
    return;
  }

  try {



    // Fetch total NFTs for the artist
    const artistTotalNFTResponse = await fetchData(generateArtistTotalNFTQuery(userInfo.id));

    // Fetch launchpad data


    // Calculate the total NFT count for the artist
    const totalNFTCount = artistTotalNFTResponse?.fans_nfts?.length || 0;

    //---------------------- Monthly Total Percentage from last period -----------------//
    const now = new Date();
    const endAt = now.getTime();
    const timezone = 'America/New_York'
    const HOUR = 60 * 60 * 1000;
    const DAY = 24 * HOUR;

    // -------- Monthly comparison (fixed 30d window) --------
    const monthlySteps = 30;
    const monthlyEndAt = endAt; // must be ms since epoch
    const monthlyStartAt = monthlyEndAt - monthlySteps * DAY;
    const prevMonthlyEndAt = monthlyStartAt;
    const prevMonthlyStartAt = prevMonthlyEndAt - monthlySteps * DAY;

    const monthlyUnit = 'day';
    const tzValue = 'America/New_York';

    let monthlyPercentChange = 0;
    try {
      const [monthlyRes, prevMonthlyRes] = await Promise.all([
        client.getWebsitePageviews(websiteId, {
          startAt: monthlyStartAt,
          endAt: monthlyEndAt,
          unit: monthlyUnit,
          timezone: tzValue,
          host: finalHost
        }),
        client.getWebsitePageviews(websiteId, {
          startAt: prevMonthlyStartAt,
          endAt: prevMonthlyEndAt,
          unit: monthlyUnit,
          timezone: tzValue,
          host: finalHost
        }),
      ]);

      const monthlyArr = monthlyRes?.data?.pageviews ?? [];
      const prevMonthlyArr = prevMonthlyRes?.data?.pageviews ?? [];

      const monthlyTotal = monthlyArr.reduce((acc, p) => acc + (Number(p?.y) || 0), 0);
      const prevMonthlyTotal = prevMonthlyArr.reduce((acc, p) => acc + (Number(p?.y) || 0), 0);

      const monthlyAbsoluteChange = monthlyTotal - prevMonthlyTotal;

      if (prevMonthlyTotal !== 0) {
        monthlyPercentChange = (monthlyAbsoluteChange / prevMonthlyTotal) * 100;
      } else if (monthlyTotal > 0) {
        monthlyPercentChange = 100;
      }

      // console.log('monthlyPercentChange',monthlyPercentChange,monthlyTotal,prevMonthlyTotal);

    } catch (error) {
      console.error("Error fetching website pageviews:", error);
      // handle error gracefully (e.g., return fallback data, rethrow, etc.)
    }

    // This month
    const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const endOfThisMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).getTime();



    // API calls
    const pageviewsTwoMonth = await client.getWebsiteStats(websiteId, {
      startAt: startOfThisMonth,
      endAt: endOfThisMonth,
      host: finalHost,
    });

    // Send response
    ctx.status = 200;
    ctx.body = {
      monthlyPercentChange,
      pageviewsTwoMonth: pageviewsTwoMonth.data,
      nft_count: totalNFTCount,

    };
  } catch (err) {
    ctx.status = 500;
    ctx.body = { error: err.message };
  }
});


// ********************* //
// Fans following
// ********************* //
router.post(BASE_URL + '/fans', async (ctx) => {
  const { userInfo } = ctx.request.body;
  const now = new Date();

  try {
    // Construct the GraphQL query dynamically to get fans/followers with date_created
    const fansFollowers = `
      query {
        fans_followers(
          filter: {
            follower_id: { id: { _eq: "${userInfo.id}" } }
          }
        ) {
          date_created
          user_id {
            id
            first_name
            last_name
            sso_email
          }
        }
      }
    `;

    // Call the API with the query to get followers
    const userFans = await apiRequest(fansFollowers);

    const followers = userFans.fans_followers || [];
    const formattedFollowers = followers.map((follower) => ({
      id: follower.user_id.id,
      first_name: follower.user_id.first_name || "Anonymous", // Handle null display_name
      last_name: follower.user_id.last_name || "",
      email: follower.user_id.ss0_email,
      date_created: new Date(follower.date_created), // Use date_created for growth calculation
    }));

    // Calculate the total number of followers
    const totalFans = formattedFollowers.length;

    // Calculate the followers from last month (e.g., July)
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1); // Start of last month
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0); // End of last month
    const lastMonthFans = formattedFollowers.filter(follower => {
      const createDate = follower.date_created;
      return createDate >= lastMonthStart && createDate <= lastMonthEnd;
    }).length;

    // Calculate the followers from this month (e.g., August)
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1); // Start of this month
    const thisMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0); // End of this month
    const thiMonthFans = formattedFollowers.filter(follower => {
      const createDate = follower.date_created;
      return createDate >= thisMonthStart && createDate <= thisMonthEnd;
    }).length;

    ctx.body = {
      fans_following: formattedFollowers,
      totalFans, // Total number of followers
      lastMonthFans, // Followers from last month (e.g., July)
      thiMonthFans, // Followers from this month (e.g., August)
    };
  } catch (err) {
    console.error("Error:", err);
    ctx.status = 500;
    ctx.body = { error: err.message };
  }
});


// ********************* //
// Active customers
// ********************* //
router.post(BASE_URL + '/customers', async (ctx) => {

  const { userInfo } = ctx.request.body;
  // console.log('userInfo',userInfo.id);

  try {
    // Construct the GraphQL query dynamically to get fans/followers with date_created
    const userNFTByers = `
    query {
        fans_nfts(
         filter: {collection: {artist: {id: {_eq: "${userInfo.id}"}}}} 
        ) {
          owner
          name
          id
        }
      }
    `;

    const nftOwners = await apiRequest(userNFTByers);
    // console.log('nftOwners',nftOwners);

    // Extract all unique owners using a Set
    const uniqueOwnersSet = new Set(nftOwners.fans_nfts.map(nft => nft.owner));

    // Get the count of unique owners
    const UniqueOwners = uniqueOwnersSet.size;
    // console.log("UniqueOwners",UniqueOwners);

    // Send the response with the required data
    ctx.body = {
      UniqueOwners, // Number of unique owners
    };
  } catch (err) {
    console.error("Error:", err);
    ctx.status = 500;
    ctx.body = { error: err.message };
  }
});


// ********************* //
// Revenue of Artist
// ********************* //
router.post(BASE_URL + '/revenue', async (ctx) => {

  const { userInfo } = ctx.request.body;
  // console.log('userInfo',userInfo.id);

  try {
    // Construct the GraphQL query dynamically to get fans/followers with date_created
    const userRevenueQuery = `
                query {
              payment_history(
                filter: {
                  launchpad_id: {
                    artist: { id: { _eq: "${userInfo.id}"} }
                    payment_status: { _eq: "APPROVED" }
                  }
                }
              ) {
                id
                payment_amount
                date_created
                user{
                    last_name
                    first_name
                    id
                    
                }
                launchpad_id {
                  id
                  artist {
                    id
                    first_name
                    last_name
                    display_name
                  }
                }
              }
            }
           `;

    const userRevenue = await apiRequest(userRevenueQuery);

    const total = userRevenue.payment_history
      .reduce((sum, p) => sum + Number(p.payment_amount || 0), 0);

    ctx.body = {
      userTotalRevenue: total
      // UniqueOwners, // Number of unique owners
    };
  } catch (err) {
    console.error("Error:", err);
    ctx.status = 500;
    ctx.body = { error: err.message };
  }
});






export default router;