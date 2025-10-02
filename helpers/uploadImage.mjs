import axios from "axios";
import { backendUrl, backendApiKey, logtail } from "./constants.mjs";

// Upload Image
export const handleImageUpload = async (image, currentImageid, folder) => {
  try {
    const response = await axios({
      url: `${backendUrl}/files`,
      method: "post",
      headers: {
        Authorization: `Bearer ${backendApiKey}`,
        "Content-Type": "multipart/form-data",
      },
      data: {
        file: image,
        folder: folder ? folder : null,
      },
    });

    // If there is a current image, delete it
    if ((currentImageid && response.data.data.id) && (currentImageid !== "d7993673-6704-42f4-a174-20f5b3d58417" && currentImageid !== "0561018d-fa42-4edb-8030-5a162375166a")) {
      await axios({
        url: `${backendUrl}/files/${currentImageid}`,
        method: "delete",
        headers: { Authorization: `Bearer ${backendApiKey}` },
      });
      console.log("Deleted Old Image", currentImageid);
    }

    // Return the new image id
    return response.data.data.id;
  } catch (err) {
    // Log Error with query for debugging
    await logtail.error(`${err}`);
    console.log({
      error: err.message,
      query: "handleImageUpload",
    });
    return null;
  }
};


export const deleteFile = async (currentfileid) => {
  try {
    
    
    const response = await axios({
        url: `${backendUrl}/files/${currentfileid}`,
        method: "delete",
        headers: { Authorization: `Bearer ${backendApiKey}` },
      });
    
    
    return response.data
  } catch (err) {
    // Log Error with query for debugging
    await logtail.error(`${err}`);
    console.log({
      error: err.message,
      query: "deleteFile",
    });
    return null;
  }
};
