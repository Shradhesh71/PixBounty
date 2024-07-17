"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var _a, _b, _c;
Object.defineProperty(exports, "__esModule", { value: true });
const tweetnacl_1 = __importDefault(require("tweetnacl"));
const client_1 = require("@prisma/client");
const express_1 = require("express");
const client_s3_1 = require("@aws-sdk/client-s3");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const config_1 = require("../config");
const middleware_1 = require("../middleware");
const s3_presigned_post_1 = require("@aws-sdk/s3-presigned-post");
const types_1 = require("../types");
const web3_js_1 = require("@solana/web3.js");
const connection = new web3_js_1.Connection((_a = process.env.RPC_URL) !== null && _a !== void 0 ? _a : "");
const PARENT_WALLET_ADDRESS = process.env.PARENT_WALLET_ADDRESS;
const DEFAULT_TITLE = "Select the most clickable thumbnail";
const s3Client = new client_s3_1.S3Client({
    credentials: {
        accessKeyId: (_b = process.env.AWS_ACCESS_KEY_ID) !== null && _b !== void 0 ? _b : "",
        secretAccessKey: (_c = process.env.AWS_SECRET_ACCESS_KEY) !== null && _c !== void 0 ? _c : "",
    },
    region: "ap-south-1",
});
const router = (0, express_1.Router)();
const prismaClient = new client_1.PrismaClient();
prismaClient.$transaction((prisma) => __awaiter(void 0, void 0, void 0, function* () {
    // Code running in a transaction...
}), {
    maxWait: 5000, // default: 2000
    timeout: 10000, // default: 5000
});
router.get("/task", middleware_1.authMiddleware, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    // @ts-ignore
    const taskId = req.query.taskId;
    // @ts-ignore
    const userId = req.userId;
    const taskDetails = yield prismaClient.task.findFirst({
        where: {
            user_id: Number(userId),
            id: Number(taskId),
        },
        include: {
            options: true,
        },
    });
    if (!taskDetails) {
        return res.status(411).json({
            message: "You dont have access to this task",
        });
    }
    // Todo: Can u make this faster?
    const responses = yield prismaClient.submission.findMany({
        where: {
            task_id: Number(taskId),
        },
        include: {
            option: true,
        },
    });
    const result = {};
    // console.log("result: ",result)
    // console.log("taskDetails: ",taskDetails)
    taskDetails.options.forEach((option) => {
        result[option.id] = {
            count: 0,
            option: {
                imageUrl: option.image_url,
            },
        };
    });
    responses.forEach((r) => {
        result[r.option_id].count++;
    });
    res.json({
        result,
        taskDetails,
    });
}));
router.post("/task", middleware_1.authMiddleware, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _d, _e, _f, _g, _h, _j;
    //@ts-ignore
    const userId = req.userId;
    // validate the inputs from the user;
    const body = req.body;
    const parseData = types_1.createTaskInput.safeParse(body);
    const user = yield prismaClient.user.findFirst({
        where: {
            id: userId,
        },
    });
    // console.log("here -2")
    if (!parseData.success) {
        return res.status(411).json({
            message: "You've sent the wrong inputs",
        });
    }
    // console.log("here -1")
    const transaction = yield connection.getTransaction(parseData.data.signature, {
        maxSupportedTransactionVersion: 1,
    });
    // console.log(transaction)
    // console.log("here0")
    if (((_e = (_d = transaction === null || transaction === void 0 ? void 0 : transaction.meta) === null || _d === void 0 ? void 0 : _d.postBalances[1]) !== null && _e !== void 0 ? _e : 0) -
        ((_g = (_f = transaction === null || transaction === void 0 ? void 0 : transaction.meta) === null || _f === void 0 ? void 0 : _f.preBalances[1]) !== null && _g !== void 0 ? _g : 0) !==
        100000000) {
        return res.status(411).json({
            message: "Transaction signature/amount incorrect",
        });
    }
    // console.log("here1")
    if (((_h = transaction === null || transaction === void 0 ? void 0 : transaction.transaction.message.getAccountKeys().get(1)) === null || _h === void 0 ? void 0 : _h.toString()) !==
        PARENT_WALLET_ADDRESS) {
        return res.status(411).json({
            message: "Transaction sent to wrong address",
        });
    }
    // console.log("here2")
    if (((_j = transaction === null || transaction === void 0 ? void 0 : transaction.transaction.message.getAccountKeys().get(0)) === null || _j === void 0 ? void 0 : _j.toString()) !==
        (user === null || user === void 0 ? void 0 : user.address)) {
        return res.status(411).json({
            message: "Transaction sent to wrong address",
        });
    }
    console.log("here3");
    // was this money paid by this user address or a different address?
    // parse the signature here to ensure the person has paid 0.1 SOL
    // const transaction = Transaction.from(parseData.data.signature);
    let response = yield prismaClient.$transaction((tx) => __awaiter(void 0, void 0, void 0, function* () {
        var _k;
        const response = yield tx.task.create({
            data: {
                title: (_k = parseData.data.title) !== null && _k !== void 0 ? _k : DEFAULT_TITLE,
                amount: 0.1 * config_1.TOTAL_DECIMALS,
                //TODO: Signature should be unique in the table else people can reuse a signature
                signature: parseData.data.signature,
                user_id: userId,
            },
        });
        yield tx.option.createMany({
            data: parseData.data.options.map((x) => ({
                image_url: x.imageUrl,
                task_id: response.id,
            })),
        });
        return response;
    }));
    console.log("Successfully created: ", response);
    res.json({
        id: response.id,
    });
}));
router.get("/presignedUrl", middleware_1.authMiddleware, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    // @ts-ignore
    const userId = req.userId;
    const { url, fields } = yield (0, s3_presigned_post_1.createPresignedPost)(s3Client, {
        Bucket: "decen-fiver71",
        Key: `fiver/${userId}/${Math.random()}/image.jpg`,
        Conditions: [
            ["content-length-range", 0, 5 * 1024 * 1024], // 5 MB max
        ],
        Expires: 3600,
    });
    res.json({
        preSignedUrl: url,
        fields,
    });
}));
router.post("/signin", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { publicKey, signature } = req.body;
    const message = new TextEncoder().encode("Sign into mechanical turks");
    const result = tweetnacl_1.default.sign.detached.verify(message, new Uint8Array(signature.data), new web3_js_1.PublicKey(publicKey).toBytes());
    if (!result) {
        return res.status(411).json({
            message: "Incorrect signature",
        });
    }
    const existingUser = yield prismaClient.user.findFirst({
        where: {
            address: publicKey,
        },
    });
    if (existingUser) {
        const token = jsonwebtoken_1.default.sign({
            userId: existingUser.id,
        }, config_1.JWT_SECRET);
        res.json({
            token,
        });
    }
    else {
        const user = yield prismaClient.user.create({
            data: {
                address: publicKey,
            },
        });
        const token = jsonwebtoken_1.default.sign({
            userId: user.id,
        }, config_1.JWT_SECRET);
        res.json({
            token,
        });
    }
}));
exports.default = router;
