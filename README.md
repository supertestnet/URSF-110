# URSF-110
A POC app for using bitcoind's "invalidateblock" command to reject BIP110

# What is this?
This is one of my proof-of-concept apps, and I hope it contributes to the ongoing spam debate in bitcoin. Some people on one side of that debate -- the "anti-spam" side, which I usually align with -- created [software](https://bip110.org/) for enforcing a "User Activated Soft Fork" (or UASF) that modifies bitcoin's consensus rules to prohibit certain forms of spam. They plan to begin enforcing their soft fork around September 2026, and in the meantime, bitcoin miners have a chance to "prepare" or even activate the soft fork in advance if they are ready. I don't like BIP110 and decided to write a "User Rejected Soft Fork" (or URSF) to fight it.

# What is a User Rejected Soft Fork?
It is a soft fork written in response to another, to fight against a bad idea. If soft fork A enforces rule X, a URSF against soft fork A enforces rule "not X." In this case, BIP110 requires miners to put certain things in their blocks (more details below), so this URSF requires them "not" to put those things in their blocks.

# What does this software do?
It has two modes: regtest and mainnet. On regtest mode, it does the following things:
- connects to your bitcoin node
- tells you how to signal to your local network that you are running this software
- pretends a BIP110 signaling window is going to begin in the next regtest block
- gives you commands to mine pro-BIP110 blocks and anti-BIP110 blocks using BIP110's signaling mechanism
- checks how many blocks signal that they are pro-BIP110 in the signaling window
- if too many blocks signal that they are pro-BIP110, it starts running bitcoin core's "invalidateblock" command to reject those blocks

There are several dozen BIP110 signaling windows between now and September. BIP110 activates if, during any of them, 55% of blocks signal support for it. BIP110 also "requires" miners to start signaling in favor of BIP110 a few weeks ahead of its activation block. Since BIP110 "requires" 55% of blocks to signal for BIP110 and this software "rejects" blocks if 55% of them signal for BIP110, miners have to choose: either keep the people running BIP110 happy or keep the people running URSF-110 happy. They can't keep both sets happy.

# What does this software do on mainnet?
I do not recommend running the software on mainnet because I am a very bad coder. It probably doesn't even work, and in a potentially-contentious soft fork like this, you could very easily lose money if you run this on a node that backs real money. This app exists for people in these exceptional categories:

1. it is for people who want to do scientific experimentation on bleeding edge technology (even if coded by a script kiddie like me)
2. it is for people who want to educate themselves on how a User Rejected Soft Fork might work
3. it is for people who are better coders than me, who want a starting point for making a better version

That said, if you *do* run this software on mainnet (and assuming it works), it does the following things:
- connects to your bitcoin node
- tells you how to signal to the real bitcoin network that you are running this software
- checks what signaling window we are in
- checks how many blocks signal that they are pro-BIP110 in the signaling window
- if too many blocks signal that they are pro-BIP110, it starts running bitcoin core's "invalidateblock" command to reject those blocks

Again, YOU CAN LOSE MONEY by running this software. Do not run it on mainnet unless you are one of the people in the exceptional categories listed above. And even then, consider just running it on regtest.

# Why did you make it?
To stop BIP110.

# Why do you dislike BIP110?
BIP110 does two bad things. First, in certain circumstances, it freezes the funds of wallets that use the [miniscript](https://bitcoin.sipa.be/miniscript/) language in a certain way. Miniscript is a bitcoin smart contracting language with a bunch of built in functions, and it is designed to "compile" a bitcoin wallet that uses one or more of those functions as selected by users and/or developers. Some of those functions sometimes violate one of BIP110's proposed rules (the rule against using the OP_IF function in taproot wallets), which could cause users of some miniscript wallets to lose funds, depending on how they use it.

This potential problem was brought up before the BIP110 software was written, including by me, and a fix was proposed, but the BIP110 devs decided to move forward without fixing it. I think it is a bad idea to potentially freeze the funds of innocent miniscript users. I think it would be better to provide wallet devs with a variant of miniscript that doesn't violate BIP110's proposed rules, and enough time to upgrade. Alternatively, BIP110 itself could be modified so that it doesn't break current versions of miniscript, but BIP110's developers have rejected that option because one of the most popular spam formats uses OP_IF in taproot transactions and they want to be sure to block that.

Apart from breaking miniscript in certain cases, there is another reason I do not like BIP110: I think most bitcoin node runners are currently largely indifferent to the forms of spam that BIP110 tries to block, and are therefore unlikely to run BIP110 on their nodes. With insufficient support from node runners, I think BIP110 will fail to sway miners to enforce its rules, and the small number of people who *do* run BIP110 will probably fork off the bitcoin network sometime close to September. I would prefer to continue winning people over to the anti-spam movement, and only do an anti-spam soft fork once there are more signs that a sufficient number of people will run it, including economic signals.

# So you think BIP110 will fail?
Yes, but I'm not sure. As of the time I am writing this, about 7.61% of bitcoin node runners appear to be running BIP110 (data from [bitnodes](https://bitnodes.io/nodes/?q=BIP110)), and it is growing. It also appears to have some economic support from Start9 Labs and Ocean Mining. I would not be surprised if the majority of "remaining" bitcoin miners eventually decide that there is a risk to their income (specifically, fee revenue) if 8% or more of the bitcoin network forks off, including -- potentially -- several significant economic users who pay them fees.

To prevent a big chunk of users from forking off the network (thus potentially reducing the number of people who send them fee-paying transactions), the majority of miners may decide, perhaps begrudgingly, to begin signaling for BIP110 just to keep the network from splitting in two. And if that happens, BIP110 would win, and potentially freeze the funds of some innocent miniscript users. It seems worth mentioning that Predyx Market, a prediction market, [has a webpage](https://beta.predyx.com/market/will-bip-110-activate-and-be-enforced-on-bitcoin-by-sept-1-2026-1770282509) where people can bet on the likelihood that BIP110 will succeed, and as of the time I am writing this, that market gives BIP110 a 5% chance of success. That is not nothing.

# How does this software help fight BIP110?
I don't want miners to support BIP110 out of fear of losing users and thus potentially freeze the funds of innocent miniscript users. Right now, it seems like they only lose users if they "ignore" BIP110. So they may start signaling support for BIP110 just to avoid losing users. I want them to have an "alternative" fear: if enough people run a "User Rejected Soft Fork" against BIP110, then miners have to pick: do they fork off the BIP110 users and keep the URSF-110 users, or do they fork off the URSF-110 users and keep the BIP110 users? I want more people to run URSF software than run BIP110, including more "economically significant" users. That way miners have an economic incentive to choose to keep the URSF-110 people and let the BIP110 people leave.

To be clear, I say I want more people to run URSF software. I do not want people to run *this specific* software (the code in this repository) except if you are in one of the exceptional categories listed above. But I do hope someone smarter than me makes a "serious" URSF software against BIP110 and then I hope lots of people run that.
