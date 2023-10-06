// 使用教程
// 1. 安装依赖 npm i
// 2. 在 https://dashboard.capsolver.com/passport/register?inviteCode=5RABgFowf082 注册账号并获取 CAPSOLVER_KEY
// 3. CAPSOLVER_KEY 填入 config.js
// 4. 将需要查询的地址填入 addresses.txt，每行一个地址
// 5. 运行 node main.js

import axios from "axios"
import { existsSync, readFileSync, writeFileSync } from "fs"
import path from "path"
import { CAPSOLVER_KEY, PAGE_KEY } from "./config.js"

const PAGE_URL = "https://genesis.celestia.org/"
const PAGE_ACTION = "submit"

async function createTask(url, key, pageAction) {
  try {
    // Define the API endpoint and payload as per the service documentation.
    const apiUrl = "https://api.capsolver.com/createTask"
    const payload = {
      clientKey: CAPSOLVER_KEY,
      task: {
        type: "ReCaptchaV3TaskProxyLess",
        // ReCaptchaV3TaskProxyLess
        websiteURL: url,
        websiteKey: key,
        pageAction: pageAction
      }
    }
    const headers = {
      "Content-Type": "application/json"
    }
    const response = await axios.post(apiUrl, payload, { headers })
    return response.data.taskId
  } catch (error) {
    console.error("Error creating CAPTCHA task: ", error)
    throw error
  }
}

async function getTaskResult(taskId) {
  try {
    const apiUrl = "https://api.capsolver.com/getTaskResult"
    const payload = {
      clientKey: CAPSOLVER_KEY,
      taskId: taskId
    }
    const headers = {
      "Content-Type": "application/json"
    }
    let result
    do {
      const response = await axios.post(apiUrl, payload, { headers })
      result = response.data
      if (result.status === "ready") {
        return result.solution
      }
      await new Promise(resolve => setTimeout(resolve, 5000)) // wait 5 seconds before retrying
    } while (true)
  } catch (error) {
    console.error("Error getting CAPTCHA result: ", error)
    throw error
  }
}

async function getResByAddr(address, recaptcha_token) {
  const url = `https://genesis-api.celestia.org/api/v1/airdrop/eligibility/${address}?recaptcha_token=${recaptcha_token}`
  try {
    const res = await axios.get(url)
    return res.data
  } catch (error) {
    // 401 就是不合格
    if (error.response?.status === 401) {
      return null
    } else {
      console.error("Error getting CAPTCHA result: ", error)
    }
  }
}

async function test() {
  console.log("Creating CAPTCHA task...")
  const taskId = await createTask(PAGE_URL, PAGE_KEY, PAGE_ACTION)
  console.log(`Task ID: ${taskId}`)
  console.log("Retrieving CAPTCHA result...")
  const solution = await getTaskResult(taskId)
  const token = solution.gRecaptchaResponse
  console.log(`Token Solution ${token}`)
  const testAddr = "0xf475E5dcCD918108ec7C1F843C7245904B453318"
  const res = await getResByAddr(testAddr, token)
  if (res?.slug === "eligible") {
    console.log(`Address ${testAddr} is eligible. [${res.category.key}]`)
  } else {
    console.log(`Address ${testAddr} is not eligible`)
  }
}

async function batchQuery() {
  // read addreses from 'addresses.txt'

  if (!CAPSOLVER_KEY) {
    return console.error("CAPSOLVER_KEY not found, please get one from https://dashboard.capsolver.com/passport/register?inviteCode=5RABgFowf082 and fill it in 'config.js'")
  }

  if (!existsSync(path.resolve() + "/addresses.txt")) {
    return console.error("addresses.txt not found")
  }
  
  const addresses = readFileSync(path.resolve() + "/addresses.txt", "utf-8")
    .split("\n")
    .map(addr => addr.trim())
  console.log(`Found ${addresses.length} addresses`)
  const finalRes = {}
  // create tasks every 10 addresses
  while (addresses.length > 0) {
    const batch = addresses.splice(0, 10)
    const promises = batch.map(async addr => {
      const taskId = await createTask(PAGE_URL, PAGE_KEY, PAGE_ACTION)
      console.log(`qeurying ${addr}, task id: ${taskId}...`)
      const solution = await getTaskResult(taskId)
      const token = solution.gRecaptchaResponse
      const res = await getResByAddr(addr, token)
      if (res?.slug === "eligible") {
        console.log(`Address ${addr} is eligible. [${res.category.key}]`)
        finalRes[addr] = res.category.key
      } else {
        console.log(`Address ${addr} is not eligible`)
        finalRes[addr] = 0
      }
    })
    await Promise.all(promises)
  }
  // mmmm-yy-dd hh:mm:ss
  const timeStamp = new Date().toLocaleString().replace(/\//g, "-")
  const saveFileName = `result ${timeStamp}.json`
  const csvFileName = `result ${timeStamp}.csv`
  const csvData = Object.entries(finalRes).map(([addr, res]) => `${addr},${res}`).join("\n")
  writeFileSync(path.resolve() + `/${saveFileName}`, JSON.stringify(finalRes, null, 2))
  writeFileSync(path.resolve() + `/${csvFileName}`, csvData)
  console.log(`query finished, result saved to ${saveFileName} and ${csvFileName}`)
}

batchQuery()

