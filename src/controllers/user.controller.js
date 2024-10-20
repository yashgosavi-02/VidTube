import { asyncHandler } from '../utils/asyncHandler.js'
import { ApiError } from '../utils/ApiError.js';
import { User } from '../models/user.model.js';
import {uploadOnCloudinary} from "../utils/cloudinary.js";
import {ApiResponse} from "../utils/ApiResponse.js";
import jwt from "jsonwebtoken";
const generateAccessAndRefreshToken = async (userId) => {
    try {
        const user = await User.findById(userId);
        const accessToken = user.generateAccessToken();
        const refreshToken = user.generateRefreshToken();

        user.refreshToken = refreshToken;
        await user.save({validateBeforeSave : false});

        return {accessToken, refreshToken}

    } catch (error) {
        throw new ApiError(500, "Failed to generate access and refresh token");
    }
}

const registerUser = asyncHandler( async (req,res) => {
    // get user details from frontend
    const {userName, fullName, email, password } = req.body;
    
    // validation - not empty
    if([fullName, email, password, userName].some((field) => field?.trim() === "")){
        throw new ApiError(400, "All fields are required");
    }
    // check if user already exist : userName, email
    const existedUser = await User.findOne({$or : [{ email }, { userName }]});

    if(existedUser){
        throw new ApiError(409, "User already exists with email or username");
    }
    // check for images, check for avatar
    const avatarLocalPath =  req.files?.avatar[0]?.path;

    // const coverImageLocalPath = req.files?.coverImage[0]?.path;

    let coverImageLocalPath;
    if(req.files && Array.isArray(req.files.coverImage) && req.files.coverImage.length > 0){
        coverImageLocalPath = req.files.coverImage[0].path;
    }

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

const loginUser = asyncHandler( async(req,res) => {
    // get userName and password
    const {userName, email,  password} = req.body;
    
    if(!(email || userName)){
        throw new ApiError(400, "Username or email is required");
    }
    if(!password){
        throw new ApiError(400, "Password is required");
    }

    // check if user exists

    const user = await User.findOne({$or : [{userName}, {email}]});

    if(!user){
        throw new ApiError(404, "User not found");
    }

    // check password
    
    const isPasswordValid = await user.isPasswordCorrect(password);
    
    if(!isPasswordValid){
        throw new ApiError(401, "Invalid password");
    }
    
    // generate access and refresh token

    const {accessToken, refreshToken} = await generateAccessAndRefreshToken(user._id);

    // send cookie
    const loggedInUser = await User.findById(user._id).select("-password -refreshToken");

    const options = {
        httpOnly : true,
        secure : true,
    }

    return res
    .status(200)
    .cookie("accessToken", accessToken, options)
    .cookie("refreshToken", refreshToken, options)
    .json(
        new ApiResponse(
            200,
            {
                user : loggedInUser, accessToken, refreshToken
            }, 
            "User logged in successfully"
        )
    );

})

const logoutUser = asyncHandler(async(req,res) => {
await User.findByIdAndUpdate(req.user._id, 
    {$set : {refreshToken : undefined}},{new : true})

    const options = {
        httpOnly : true,
        secure : true,
    }

    return res
    .status(200)
    .clearCookie("accessToken", options)
    .clearCookie("refreshToken", options)
    .json(new ApiResponse(200, {}, "User logged out successfully"));
})

const refreshAccessToken = asyncHandler(async(req,res) => {
    const incomingRefreshToken = req.cookies.refreshToken || req.body.refreshToken;

    if(!incomingRefreshToken){
        throw new ApiError(401, "Unauthorized Request");
    }

    try {
        const decodedToken = jwt.verify(incomingRefreshToken, process.env.REFRESH_TOKEN_SECRET);
    
        const user = await User.findById(decodedToken?._id);
    
        if(!user){
            throw new ApiError(401,"Invalid refresh token");
        }
    
        if(user?.refreshToken !== incomingRefreshToken){
            throw new ApiError(401, "Refresh token is expired or used");
        }
        
        const options = {
            httpOnly : true,
            secure : true,
        }
    
        const {accessToken , newRefreshToken} = await generateAccessAndRefreshToken(user._id);
    
        return res
        .status(200)
        .cookie("accessToken", accessToken, options)
        .cookie("refreshToken", newRefreshToken, options)
        .json(
            new ApiResponse(200, {accessToken, newRefreshToken}, 
            "Access token refreshed successfully"
            )
        )
    } catch (error) {
        throw new ApiError(401, error?.message || "Invalid refresh token"
        );
    }
})

const changePassword = asyncHandler(async(req,res) =>{
    try {
        const {currentPassword, newPassword} = req.body;
        const user = await User.findById(req.user?._id);
        
        const isPasswordValid = await user.isPasswordCorrect(currentPassword);
    
        if(!isPasswordValid){
            throw new ApiError(400, "Invalid current password");
        }
        user.password = newPassword;
        await user.save({
            validateBeforeSave : false
        });
    
        return res
        .status(200)
        .json(new ApiResponse(200,{}, "Password changed successfully"));
    } catch (error) {
        throw new ApiError(500, error?.message || "Failed to change password");
    }
    

})

const getCurrentUser = asyncHandler(async(req,res) => {
    try {
        return res
        .status(200)
        .json(new ApiResponse(200, req.user, "Current User fetched successfully"));
    } catch (error) {
        throw new ApiError(500, error?.message || "Failed to fetch user");
    }
})

const updateAccountDetails = asyncHandler(async(req,res)=>{
    try {
        const {fullName, email} = req.body;
        
        if(!(fullName || email)){
            throw new ApiError(400, "All field are required");
        }
    
        const user = await User.findByIdAndUpdate(req.user?._id, {
            $set : {fullName, email}
        }, {new : true}).select("-password");
    
        return res
        .status(200)
        .json(new ApiResponse(200, user, "User details updated successfully"));
    
    } catch (error) {
        throw new ApiError(500, error?.message || "Failed to update user details");
    }
})

const updateUserAvatar = asyncHandler(async(req,res) => {
    try {
        const avatarLocalPath = req.file?.path;
        if(!avatarLocalPath){
            throw new ApiError(400, "Avatar is required");
        }
        const avatar = await uploadOnCloudinary(avatarLocalPath);
        if(!avatar.url){
            throw new ApiError(400, "Failed to upload avatar");
        }

        const user = await User.findByIdAndUpdate(req.user?._id, {
            $set : {avatar : avatar.url}
        }, {new : true}).select("-password");

        return res
        .status(200)
        .json(new ApiResponse(200, user, "Avatar updated successfully"));

    } catch (error) {
        throw new ApiError(500, error?.message || "Failed to update avatar");
    }
})

const updateUserCoverImage = asyncHandler(async(req,res) => {
    try {
        const coverImageLocalPath = req.file?.path;
        if(!coverImageLocalPath){
            throw new ApiError(400, "Cover image is required");
        }
        const coverImage = await uploadOnCloudinary(coverImageLocalPath);
        if(!coverImage.url){
            throw new ApiError(400, "Failed to upload cover image");
        }

        const user = await User.findByIdAndUpdate(req.user?._id, {
            $set : {coverImage : coverImage.url}
        }, {new : true}).select("-password");

        return res
        .status(200)
        .json(new ApiResponse(200, user, "Cover image updated successfully"));
        
    } catch (error) {
        throw new ApiError(500, error?.message || "Failed to update cover image");
    }
})
    
export {registerUser, loginUser, logoutUser, refreshAccessToken, changePassword, getCurrentUser, updateAccountDetails, updateUserAvatar, updateUserCoverImage};