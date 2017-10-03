# osls

Open source livestreaming technology.

# Check it out live

https://opensourcelivestream.com/

# Reach a dev

https://discord.gg/RRHvYUe

# Set up an osls digital ocean droplet.

<!-- replace domain.tld with your domain name and tld. ex: example.com -->

apt-get update && apt-get install software-properties-common && add-apt-repository ppa:certbot/certbot && apt-get update && apt-get install certbot && certbot certonly --standalone -d domain.tld -d www.domain.tld && curl -o- https://raw.githubusercontent.com/creationix/nvm/v0.33.4/install.sh | bash && export NVM_DIR="$HOME/.nvm" && [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh" && [ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion" && nvm install node && git clone https://github.com/anticlergygang/osls.git && npm i --save shdb http https ws rtmp-server