import express from "express"
import userRouter from "./routers/user"
import workerRouter from "./routers/worker"
import cors from "cors"
import dotenv from "dotenv"

const app = express()
dotenv.config()

app.use(express.json())
app.use(cors())

app.use("/v1/user", userRouter)
app.use("/v1/worker", workerRouter)

app.listen(process.env.PORT, () => {
    console.log(`Server listening on PORT(${process.env.PORT}).`)
})
