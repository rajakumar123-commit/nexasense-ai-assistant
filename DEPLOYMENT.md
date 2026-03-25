# 🚀 NexaSense AI — 100% Free Production Deployment Guide

This guide will walk you through deploying the complete NexaSense AI architecture (PostgreSQL, Redis, ChromaDB, Node.js API, Node.js Worker, and React Frontend) to **AWS EC2 Free Tier ($0.00/month)**.

---

## Phase 1: Set Up Your AWS Account & Server
We need a free Virtual Private Server (VPS) to host your Docker containers.

### 1. Create your AWS Account
1. Go to [aws.amazon.com/free](https://aws.amazon.com/free) and click **Create a Free Account**.
2. Fill in your details. You will need a debit/credit card for identity verification. 
   *(Note: AWS will temporarily deduct a ₹2 holding fee and refund it instantly. You will NOT be charged monthly if you stick to the Free Tier).*

### 2. Launch an EC2 Instance (Server)
1. Once logged in, search for **EC2** in the top search bar.
2. Go to the EC2 Dashboard and click the orange **Launch Instance** button.
3. **Name:** Type `nexasense-server`.
4. **OS Images:** Click on **Ubuntu** and leave it on *Ubuntu 22.04 LTS* or *24.04 LTS (Free Tier Eligible)*.
5. **Instance Type:** Select `t2.micro` or `t3.micro` *(This gives you 1GB RAM for 12 months free)*.
6. **Key Pair:** Click **Create new key pair**, name it `nexasense-key`, select **RSA** and **.pem**, and click download. Keep this `.pem` file safe—you need it to log in!
7. **Network Settings:** Check the boxes to allow:
   * Allow SSH traffic from Anywhere
   * Allow HTTP traffic from the internet
   * Allow HTTPS traffic from the internet
8. **Storage:** Increase the default 8GB hard drive to **20GB** *(Free tier allows up to 30GB)*.
9. Click **Launch Instance** in the bottom right.

---

## Phase 2: Connect to Your Server
Now we need to log into the terminal of the remote PC we just rented.

1. Open your terminal (or PowerShell on Windows).
2. Use the `ssh` command and point it to the `.pem` file you downloaded. 
   *(Go to the EC2 Dashboard > "Instances", click on your server, and copy the **Public IPv4 address**)*.
   
```bash
# Example SSH command:
ssh -i "path/to/your/nexasense-key.pem" ubuntu@YOUR-PUBLIC-IP-ADDRESS
```

When it asks "Are you sure you want to continue connecting?", type `yes`.

---

## Phase 3: The Secret Sauce — Add a Swapfile
Your free server only has 1GB of RAM. The AI Embedding models and ChromaDB will instantly crash because they need 3GB+ of memory. 

To fix this, we will convert 4GB of your SSD Hard Drive into "Fake RAM" (called a Swapfile). **Run these commands one by one:**

```bash
sudo fallocate -l 4G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile

# Make it permanent so it survives server reboots:
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```
*(Verify it worked by typing `free -m`. You should see `Swap` showing about 4000MB).*

---

## Phase 4: Install Docker & Download Your Code

Now we need the tools to run the project.

### 1. Install Git and Docker
```bash
sudo apt update
sudo apt install -y git docker.io docker-compose
```

### 2. Download Your Code
Clone the clean repository you just pushed to GitHub. (Replace with your actual GitHub link).
```bash
git clone https://github.com/YourUsername/YourRepoName.git
cd YourRepoName
```

### 3. Create the Production Environment File
Because we specifically blocked `.env` from GitHub for security, you must recreate it on your live server!
```bash
cp .env.example .env
nano .env
```

**What to edit in `nano`:**
1. Leave all the database links (`CHROMA_URL`, `DATABASE_URL`) exactly as they are.
2. Paste your actual **Gemini** and **Groq** AI Keys.
3. Paste your **Razorpay** Key and Secret.
4. Set a long random password for `JWT_SECRET` and `JWT_REFRESH_SECRET`.
5. Set `NODE_ENV=production`.

*(To save the file: Press `CTRL + X`, then press `Y`, then press `Enter/Return`).*

---

## Phase 5: Launch the NexaSense Ecosystem
Everything is configured. It’s time to start the engine!

```bash
sudo docker-compose up --build -d
```

This will take 3-5 minutes on the first run. Docker will:
- Set up PostgreSQL and vector tools.
- Install Redis and ChromaDB.
- Build your Node.js backend.
- Build your React frontend into a highly optimized Nginx website.

Once it finishes, type `sudo docker ps` to verify all 6 containers are running.

---

## Phase 6: You Are Live! 🍾
Open your web browser and navigate directly to your server's public IP Address:
**http://YOUR-PUBLIC-IP-ADDRESS**

You will instantly see the beautiful NexaSense 10/10 layout!

### Important Architecture Note for AWS Free Tier:
Because the server is using an SSD Swapfile to handle the AI memory instead of real RAM, document uploading and chunking may take **slightly longer** (20-40 seconds) the very first time you upload a PDF. This is perfectly normal and a worthy trade-off for zero costs!
