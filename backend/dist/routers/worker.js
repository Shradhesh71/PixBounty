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
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const client_1 = require("@prisma/client");
const config_1 = require("../config");
const middleware_1 = require("../middleware");
const db_1 = require("../db");
const types_1 = require("../types");
const web3_js_1 = require("@solana/web3.js");
const tweetnacl_1 = __importDefault(require("tweetnacl"));
const privateKey_1 = require("../privateKey");
const bs58_1 = require("bs58");
const connection = new web3_js_1.Connection(process.env.RPC_URL);
const router = (0, express_1.Router)();
const prismaClient = new client_1.PrismaClient();
prismaClient.$transaction((Prisma) => __awaiter(void 0, void 0, void 0, function* () { }), {
    maxWait: 500,
    timeout: 1000,
});
const TOTAL_SUBMISSIONS = 100;
router.post("/payout", middleware_1.workerMiddleware, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    // @ts-ignore
    const userId = req.userId;
    const worker = yield prismaClient.worker.findFirst({
        where: { id: Number(userId) },
    });
    if (!worker) {
        return res.status(411).json({
            message: "User not found.",
        });
    }
    const address = worker.address;
    const transaction = new web3_js_1.Transaction().add(web3_js_1.SystemProgram.transfer({
        fromPubkey: new web3_js_1.PublicKey(process.env.PARENT_WALLET_ADDRESS),
        toPubkey: new web3_js_1.PublicKey(worker.address),
        lamports: (100000000000 * worker.pending_amount) / config_1.TOTAL_DECIMALS,
    }));
    const keypair = web3_js_1.Keypair.fromSecretKey((0, bs58_1.decode)(privateKey_1.privateKey));
    let signature = "";
    try {
        signature = yield (0, web3_js_1.sendAndConfirmTransaction)(connection, transaction, [
            keypair,
        ]);
    }
    catch (e) {
        return res.json({
            message1: e.message,
            message: "Transaction failed😓.",
        });
    }
    // We should add a lock here
    yield prismaClient.$transaction((tx) => __awaiter(void 0, void 0, void 0, function* () {
        yield tx.worker.update({
            where: {
                id: Number(userId),
            },
            data: {
                pending_amount: {
                    decrement: worker.pending_amount,
                },
                locked_amount: {
                    increment: worker.pending_amount,
                },
            },
        });
        yield tx.payout.create({
            data: {
                user_id: Number(userId),
                amount: worker.pending_amount,
                status: "Proccessing",
                signature: signature,
            },
        });
    }));
    res.json({
        message: "Processing Payout",
        amount: worker.pending_amount,
    });
}));
router.get("/balance", middleware_1.workerMiddleware, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    // @ts-ignore
    const userId = req.userId;
    const worker = yield prismaClient.worker.findFirst({
        where: {
            id: Number(userId),
        },
    });
    if (!worker) {
        return res.status(411).json({
            message: "Worker not found, please try again.",
        });
    }
    res.json({
        pendingAmount: worker.pending_amount,
        lockedAmount: worker.locked_amount,
    });
}));
router.post("/submission", middleware_1.workerMiddleware, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    // @ts-ignore
    const userId = req.userId;
    const body = req.body;
    const parsedBody = types_1.createSubmissionInput.safeParse(body);
    if (parsedBody.success) {
        const task = yield (0, db_1.getNextTask)(Number(userId));
        if (!task || (task === null || task === void 0 ? void 0 : task.id) !== Number(parsedBody.data.taskId)) {
            return res.status(411).json({
                message: "Incorrect task id",
            });
        }
        const amount = (Number(task.amount) / TOTAL_SUBMISSIONS).toString();
        const submission = yield prismaClient.$transaction((tx) => __awaiter(void 0, void 0, void 0, function* () {
            const submission = yield tx.submission.create({
                data: {
                    option_id: Number(parsedBody.data.selection),
                    worker_id: userId,
                    task_id: Number(parsedBody.data.taskId),
                    amount: amount,
                },
            });
            yield tx.worker.update({
                where: {
                    id: userId,
                },
                data: {
                    pending_amount: {
                        increment: Number(amount),
                    },
                },
            });
            return submission;
        }));
        const nextTask = yield (0, db_1.getNextTask)(Number(userId));
        res.json({
            nextTask,
            amount,
        });
    }
    else {
        res.status(411).json({
            message: "Incorrect inputs",
        });
    }
}));
router.get("/nextTask", middleware_1.workerMiddleware, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    // @ts-ignore
    const userId = req.userId;
    const task = yield (0, db_1.getNextTask)(Number(userId));
    if (!task) {
        res.status(411).json({
            message: "No more task are left for reviewed.",
        });
    }
    else {
        res.status(200).json({ task });
    }
}));
router.post("/signin", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { publicKey, signature } = req.body;
    const message = new TextEncoder().encode("Sign into mechanical turks as an worker");
    const result = tweetnacl_1.default.sign.detached.verify(message, new Uint8Array(signature.data), new web3_js_1.PublicKey(publicKey).toBytes());
    if (!result) {
        return res.status(411).json({
            message: "Incorrect Signature.",
        });
    }
    const existingUser = yield prismaClient.worker.findFirst({
        where: {
            address: publicKey,
        },
    });
    if (existingUser) {
        const token = jsonwebtoken_1.default.sign({ userId: existingUser.id }, config_1.WORKER_JWT_SECRET);
        res.json({ token, amount: existingUser.pending_amount });
    }
    else {
        const user = yield prismaClient.worker.create({
            data: {
                address: publicKey,
                pending_amount: 0,
                locked_amount: 0,
            },
        });
        const token = jsonwebtoken_1.default.sign({ userId: user.id }, config_1.WORKER_JWT_SECRET);
        res.json({ token, amount: 0 });
    }
}));
exports.default = router;
