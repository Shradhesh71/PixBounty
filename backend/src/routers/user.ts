import nacl from "tweetnacl"
import { PrismaClient } from "@prisma/client"
import { Router } from "express"
import { S3Client } from "@aws-sdk/client-s3"
import jwt from "jsonwebtoken"
import { JWT_SECRET, TOTAL_DECIMALS } from "../config"
import { authMiddleware } from "../middleware"
import { createPresignedPost } from "@aws-sdk/s3-presigned-post"
import { createTaskInput } from "../types"
import { Connection, PublicKey } from "@solana/web3.js"

const connection = new Connection(process.env.RPC_URL!)

const PARENT_WALLET_ADDRESS = process.env.PARENT_WALLET_ADDRESS

const DEFAULT_TITLE = "Select the most clickable thumbnail."

const s3Client = new S3Client({
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? "",
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? "",
    },
    region: "ap-south-1",
})

const router = Router()

const prismaClient = new PrismaClient()

prismaClient.$transaction(
    async (prisma) => {
        // Code running in a transaction...
    },
    {
        maxWait: 5000, // default: 2000
        timeout: 10000, // default: 5000
    },
)

router.get("/task", authMiddleware, async (req, res) => {
    // @ts-ignore
    const taskId: string = req.query.taskId
    // @ts-ignore
    const userId: string = req.userId

    const taskDetails = await prismaClient.task.findFirst({
        where: {
            user_id: Number(userId),
            id: Number(taskId),
        },
        include: {
            options: true,
        },
    })

    if (!taskDetails) {
        return res.status(411).json({
            message:
                "You dont have access to this task, Please Select Wallet Account.",
        })
    }

    // Todo: Can u make this faster?
    const responses = await prismaClient.submission.findMany({
        where: {
            task_id: Number(taskId),
        },
        include: {
            option: true,
        },
    })

    const result: Record<
        string,
        {
            count: number
            option: {
                imageUrl: string
            }
        }
    > = {}

    taskDetails.options.forEach((option) => {
        result[option.id] = {
            count: 0,
            option: {
                imageUrl: option.image_url,
            },
        }
    })

    responses.forEach((r) => {
        result[r.option_id].count++
    })

    res.json({
        result,
        taskDetails,
    })
})

router.post("/task", authMiddleware, async (req, res) => {
    //@ts-ignore
    const userId = req.userId
    // validate the inputs from the user;
    const body = req.body

    const parseData = createTaskInput.safeParse(body)

    const user = await prismaClient.user.findFirst({
        where: {
            id: userId,
        },
    })

    if (!parseData.success) {
        return res.status(411).json({
            message: "You've sent the wrong inputs, Please try again.",
        })
    }

    const transaction = await connection.getTransaction(
        parseData.data.signature,
        {
            maxSupportedTransactionVersion: 1,
        },
    )

    if (
        (transaction?.meta?.postBalances[1] ?? 0) -
            (transaction?.meta?.preBalances[1] ?? 0) !==
        100000000
    ) {
        return res.status(411).json({
            message: "Transaction amount incorrect.",
        })
    }

    if (
        transaction?.transaction.message.getAccountKeys().get(1)?.toString() !==
        PARENT_WALLET_ADDRESS
    ) {
        return res.status(411).json({
            message: "Transaction sent to WRONG address.",
        })
    }

    if (
        transaction?.transaction.message.getAccountKeys().get(0)?.toString() !==
        user?.address
    ) {
        return res.status(411).json({
            message: "Transaction come from WRONG address.",
        })
    }
    // was this money paid by this user address or a different address?

    let response = await prismaClient.$transaction(async (tx) => {
        const response = await tx.task.create({
            data: {
                title: parseData.data.title ?? DEFAULT_TITLE,
                amount: 0.1 * TOTAL_DECIMALS,
                signature: parseData.data.signature,
                user_id: userId,
            },
        })

        await tx.option.createMany({
            data: parseData.data.options.map((x) => ({
                image_url: x.imageUrl,
                task_id: response.id,
            })),
        })

        return response
    })
    console.log("Successfully created: ", response)
    res.json({
        id: response.id,
    })
})

router.get("/presignedUrl", authMiddleware, async (req, res) => {
    // @ts-ignore
    const userId = req.userId

    const { url, fields } = await createPresignedPost(s3Client, {
        Bucket: process.env.AWS_BUCKET!,
        Key: `fiver/${userId}/${Math.random()}/image.jpg`,
        Conditions: [
            ["content-length-range", 0, 5 * 1024 * 1024], // 5 MB max
        ],
        Expires: 3600,
    })

    res.json({
        preSignedUrl: url,
        fields,
    })
})

router.post("/signin", async (req, res) => {
    const { publicKey, signature } = req.body
    console.log("signature: ",signature)
    const message = new TextEncoder().encode("Sign into mechanical turks")

    const result = nacl.sign.detached.verify(
        message,
        new Uint8Array(signature.data),
        new PublicKey(publicKey).toBytes(),
    )

    if (!result) {
        return res.status(411).json({
            message: "Incorrect Signature, Please verify again.",
        })
    }

    const existingUser = await prismaClient.user.findFirst({
        where: {
            address: publicKey,
        },
    })

    if (existingUser) {
        const token = jwt.sign(
            {
                userId: existingUser.id,
            },
            JWT_SECRET,
        )

        res.json({
            token,
        })
    } else {
        const user = await prismaClient.user.create({
            data: {
                address: publicKey,
            },
        })

        const token = jwt.sign(
            {
                userId: user.id,
            },
            JWT_SECRET,
        )

        res.json({
            token,
        })
    }
})

export default router
