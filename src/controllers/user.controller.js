import { asyncHandler } from '../utils/asyncHandler.js'
import { ApiError } from '../utils/ApiError.js';
import { User } from '../models/user.model.js';
import {uploadOnCloudinary} from "../utils/cloudinary.js";
import {ApiResponse} from "../utils/ApiResponse.js";
const registerUser = asyncHandler( async (req,res) => {
    // get user details from frontend
    const {userName, fullName, email, password } = req.body;
    console.log("Email : ", email);

    // validation - not empty
    if([fullName, email, password, userName].some((field) => field?.trim() === "")){
        throw new ApiError(400, "All fields are required");
    }

    // check if user already exist : userName, email
    const existedUser = User.findOne({$or : [{ email }, { userName }]});

    if(existedUser){
        throw new ApiError(409, "User already exists with email or username");
    }

    
    // check for images, check for avatar
    const avatarLocalPath =  req.files?.avatar[0]?.path;

    const coverImageLocalPath = req.files?.coverImage[0]?.path;

    if(!avatarLocalPath){
        throw new ApiError(400, "Avatar is required");
    }
    // upload them to cloudinary, avatar
    const avatar = await uploadOnCloudinary(avatarLocalPath);

    const coverImage = await uploadOnCloudinary(coverImageLocalPath);

    if(!avatar){
        throw new ApiError(500, "Failed to upload avatar");
    }

    // create user object - create entry in db
    const user = await User.create({
        userName : userName.toLowerCase(),
        fullName,
        email,
        password,
        avatar : avatar.url,
        coverImage : coverImage?.url || "",
    })
    
    // remove password and refresh token field from response
    const createdUser = await User.findById(user._id).select("-password -refreshToken");
    // check for user creation
    if(!createdUser){
        throw new ApiError(500, "Failed to create user");
    }
    // return response
    return res.status(201).json(new ApiResponse(200, createdUser, "User created successfully"));
})


export {registerUser};