import { Router } from "express"
import jwt from "jsonwebtoken"
import { PrismaClient } from "@prisma/client"
import { TOTAL_DECIMALS, WORKER_JWT_SECRET } from "../config"
import { workerMiddleware } from "../middleware"
import { getNextTask } from "../db"
import { createSubmissionInput } from "../types"
import {
    Connection,
    Keypair,
    PublicKey,
    sendAndConfirmTransaction,
    SystemProgram,
    Transaction,
} from "@solana/web3.js"
import nacl from "tweetnacl"
import { decode } from "bs58"
const connection = new Connection(process.env.RPC_URL!)
const router = Router()

const prismaClient = new PrismaClient()

prismaClient.$transaction(async (Prisma) => {}, {
    maxWait: 500,
    timeout: 1000,
})

const TOTAL_SUBMISSIONS = 100

router.post("/payout", workerMiddleware, async (req, res) => {
    // @ts-ignore
    const userId: string = req.userId

    const worker = await prismaClient.worker.findFirst({
        where: { id: Number(userId) },
    })

    if (!worker) {
        return res.status(411).json({
            message: "User not found.",
        })
    }
    const address = worker.address

    const transaction = new Transaction().add(
        SystemProgram.transfer({
            fromPubkey: new PublicKey(process.env.PARENT_WALLET_ADDRESS!),
            toPubkey: new PublicKey(worker.address),
            lamports:
                (1000_000_000_00 * worker.pending_amount) / TOTAL_DECIMALS,
        }),
    )

    const keypair = Keypair.fromSecretKey(decode(process.env.PRIVATE_KEY!))

    let signature = ""
    try {
        signature = await sendAndConfirmTransaction(connection, transaction, [
            keypair,
        ])
    } catch (e: any) {
        return res.json({
            message1: e.message,
            message: "Transaction failed😓.",
        })
    }

    // We should add a lock here
    await prismaClient.$transaction(async (tx) => {
        await tx.worker.update({
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
        })

        await tx.payout.create({
            data: {
                user_id: Number(userId),
                amount: worker.pending_amount,
                status: "Proccessing",
                signature: signature,
            },
        })
    })

    res.json({
        message: "Processing Payout",
        amount: worker.pending_amount,
    })
})

router.get("/balance", workerMiddleware, async (req, res) => {
    // @ts-ignore
    const userId: string = req.userId

    const worker = await prismaClient.worker.findFirst({
        where: {
            id: Number(userId),
        },
    })

    if (!worker) {
        return res.status(411).json({
            message: "Worker not found, please try again.",
        })
    }

    res.json({
        pendingAmount: worker.pending_amount,
        lockedAmount: worker.locked_amount,
    })
})

router.post("/submission", workerMiddleware, async (req, res) => {
    // @ts-ignore
    const userId = req.userId
    const body = req.body
    const parsedBody = createSubmissionInput.safeParse(body)

    if (parsedBody.success) {
        const task = await getNextTask(Number(userId))
        if (!task || task?.id !== Number(parsedBody.data.taskId)) {
            return res.status(411).json({
                message: "Incorrect task id",
            })
        }

        const amount = (Number(task.amount) / TOTAL_SUBMISSIONS).toString()

        const submission = await prismaClient.$transaction(async (tx) => {
            const submission = await tx.submission.create({
                data: {
                    option_id: Number(parsedBody.data.selection),
                    worker_id: userId,
                    task_id: Number(parsedBody.data.taskId),
                    amount: amount,
                },
            })

            await tx.worker.update({
                where: {
                    id: userId,
                },
                data: {
                    pending_amount: {
                        increment: Number(amount),
                    },
                },
            })

            return submission
        })

        const nextTask = await getNextTask(Number(userId))
        res.json({
            nextTask,
            amount,
        })
    } else {
        res.status(411).json({
            message: "Incorrect inputs",
        })
    }
})

router.get("/nextTask", workerMiddleware, async (req, res) => {
    // @ts-ignore
    const userId: string = req.userId

    const task = await getNextTask(Number(userId))

    if (!task) {
        res.status(411).json({
            message: "No more task are left for reviewed.",
        })
    } else {
        res.status(200).json({ task })
    }
})

router.post("/signin", async (req, res) => {
    const { publicKey, signature } = req.body
    const message = new TextEncoder().encode(
        "Sign into mechanical turks as an worker",
    )

    const result = nacl.sign.detached.verify(
        message,
        new Uint8Array(signature.data),
        new PublicKey(publicKey).toBytes(),
    )

    if (!result) {
        return res.status(411).json({
            message: "Incorrect Signature.",
        })
    }

    const existingUser = await prismaClient.worker.findFirst({
        where: {
            address: publicKey,
        },
    })

    if (existingUser) {
        const token = jwt.sign({ userId: existingUser.id }, WORKER_JWT_SECRET)
        res.json({ token, amount: existingUser.pending_amount })
    } else {
        const user = await prismaClient.worker.create({
            data: {
                address: publicKey,
                pending_amount: 0,
                locked_amount: 0,
            },
        })
        const token = jwt.sign({ userId: user.id }, WORKER_JWT_SECRET)
        res.json({ token, amount: 0 })
    }
})

export default router
