//principal dependencies
var crypto = require( 'crypto' );
var readline = require( 'readline' );
globalThis.crypto = crypto;
var tapscript = require( '@cmdcode/tapscript' );
var waitSomeTime = num => new Promise( resolve => setTimeout( resolve, num ) );
var getRand = num => bytesToHex( crypto.getRandomValues( new Uint8Array( num ) ) );
var prompt = question => {
    var rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    return new Promise( resolve => {
        rl.question( question, answer => {
            resolve( answer );
            rl.close();
        });
    });
}
var queryCore = async ( method, params = [], rpc_hostname, rpc_port, rpc_username, rpc_password ) => {
    var request_id = getRand( 16 );
    var request_data = await fetch( `${rpc_hostname}:${rpc_port}/`, {
        method: 'POST',
        headers: {
            'Content-Type': 'text/plain;',
            'Authorization': 'Basic ' + btoa( `${rpc_username}:${rpc_password}` ),
        },
        body: JSON.stringify({
            jsonrpc: '2.0',
            id: request_id,
            method,
            params,
        }),
    });
    return request_data.json();
}

//mining dependencies
var hexToBytes = hex => Uint8Array.from( hex.match( /.{1,2}/g ).map( byte => parseInt( byte, 16 ) ) );
var bytesToHex = bytes => bytes.reduce( ( str, byte ) => str + byte.toString( 16 ).padStart( 2, "0" ), "" );
var reverseHexString = s => s.match( /[a-fA-F0-9]{2}/g ).reverse().join( '' );
var hexToBinary = hex => {
    var array_hex = hex.match( /\w{2}/g );
    var array_bin = [];
    array_hex.forEach( item => array_bin.push( ( parseInt( item, 16 ).toString( 2 ) ).padStart( 8, '0' ) ) );
    return array_bin.join( "" );
}
var bitsToTarget = bits => {
    var size = bits >> 24;
    var word = bits & 0x007fffff;
    if ( size <= 3 ) return BigInt( word ) << BigInt( 8 * ( size - 3 ) );
    else return BigInt( word ) << BigInt( 8 * ( size - 3 ) );
}
var targetToHex = nbits => bitsToTarget( nbits ).toString( 16 ).padStart( 64, "0" );
var sha256 = async s => {
    if ( typeof s == "string" ) s = new TextEncoder().encode( s );
    var arr = await crypto.subtle.digest( 'SHA-256', s );
    return bytesToHex( new Uint8Array( arr ) );
}
var dSHA256 = async input => {
    var fsthash = await sha256( hexToBytes( input ) );
    var sndhash = await sha256( hexToBytes( fsthash ) );
    return sndhash;
}
var getBlockReward = ( blockheight ) => {
    var subsidy = 50n * 100_000_000n;
    var halving_interval = 150;
    var halvings = Math.floor( blockheight / halving_interval );
    if ( halvings >= 64 ) return 0;
    subsidy >>= BigInt( halvings );
    return Number( subsidy );
}
var makeHeader = block_info => {
    var header = '';
    header += reverseHexString( block_info.version );
    header += reverseHexString( block_info.prevblock );
    header += reverseHexString( block_info.merkle_root );
    header += reverseHexString( block_info.timestamp_hex );
    header += reverseHexString( block_info.difficulty );
    header += reverseHexString( block_info.nonce );
    return header;
}
var makeBlock = async ( addy, current_blockheight, pro_bip110, timestamp, rpc_hostname, rpc_port, rpc_username, rpc_password ) => {
    //get the previous block
    var method = 'getblockhash';
    var params = [ current_blockheight ];
    var json = await queryCore( method, params, rpc_hostname, rpc_port, rpc_username, rpc_password );
    var method = 'getblock';
    var params = [ json.result, 0 ];
    var json = await queryCore( method, params, rpc_hostname, rpc_port, rpc_username, rpc_password );
    var previous_block_hex = json.result;

    //prepare additional variables
    if ( !addy ) var addy = tapscript.Address.fromScriptPubKey( [ 1, "a".repeat( 64 ) ], "regtest" );
    var difficulty = '207fffff';
    var cb_value = getBlockReward( current_blockheight + 1 );
    var prev_header = previous_block_hex.substring( 0, 160 );
    var prevblock = reverseHexString( await dSHA256( prev_header ) );
    var prev_height = current_blockheight;
    if ( prev_height + 1 > 16 ) {
        var blockheight_as_hex = ( prev_height + 1 ).toString( 16 );
        if ( blockheight_as_hex.length % 2 ) blockheight_as_hex = "0" + blockheight_as_hex;
        blockheight_as_hex = reverseHexString( blockheight_as_hex );
        if ( blockheight_as_hex.length < 3 ) blockheight_as_hex = blockheight_as_hex + "00";
        var bh_prefix = ( blockheight_as_hex.length / 2 ).toString( 16 );
        if ( bh_prefix.length % 2 ) bh_prefix = "0" + bh_prefix;
        blockheight_as_hex = bh_prefix + blockheight_as_hex;
    } else {
        var blockheight_as_hex = tapscript.Script.fmt.toAsm( tapscript.Script.encode( [ prev_height + 1 ] ) )[ 0 ];
    }

    //mine based on difficulty
    var loop = async () => {
        var rand = getRand( 32 );
        var coinbase = tapscript.Tx.create({
            vin: [{
                txid: "0".repeat( 64 ),
                vout: 0xffffffff,
                sequence: 0xffffffff,
                scriptSig: blockheight_as_hex + rand,
            }],
            vout: [{
                value: cb_value,
                scriptPubKey: tapscript.Address.toScriptPubKey( addy ),
            }],
        });
        if ( !timestamp ) timestamp = Math.floor( Date.now() / 1000 );
        var timestamp_hex = timestamp.toString( 16 );
        if ( timestamp_hex.length % 2 ) timestamp_hex = "0" + timestamp_hex;
        var block_info = {
            version: pro_bip110 ? "30000008" : "30000000",
            prevblock,
            merkle_root: tapscript.Tx.util.getTxid( coinbase ),
            timestamp_hex,
            difficulty,
            nonce: "00000000",
        }
        var header = makeHeader( block_info );
        var target = targetToHex( parseInt( difficulty, 16 ) ).padStart( 64, "0" );
        var header_hash = reverseHexString( await dSHA256( header ) );
        var under_target = BigInt( `0x${header_hash}` ) < BigInt( `0x${target}` );
        if ( under_target ) return [ coinbase, header, header_hash, target ];
        return await loop();
    }
    return await loop();
}

(async()=>{
    //tell user what this app needs from them
    var how_to_start = await prompt( `\n============================\n\nThis app requires four things from your copy of bitcoind to run properly: its rpc hostname, its rpc port, your rpc username, and your rpc password.\n\nHit enter if you are ready to answer a prompt for each one\n\nOr, type "instructions" and *then* hit enter to learn how to find them.\n\n$ ` );
    if ( how_to_start ) return console.log( `\n============================\n\nGo into your bitcoind configuration file. Look for lines similar to these ones:\n\nrpcport=8332\nrpcuser=whatever_username_you_want\nrpcpassword=whatever_password_you_want\n\nIf lines like that do not exist, create them and set your rpc username and password to whatever you want, then save the file. Your rpc hostname is probably http://127.0.0.1; if it's not, you're probably an expert, and do not need this tutorial.\n\nVoila! The data you need appears on each of those lines *after* the equals sign. Restart this app to continue and be ready to type them in upon request` );

    //get the user's rpc info
    var rpc_hostname = await prompt( `\n============================\n\nEnter the rpc hostname for your copy of bitcoind. Note that it is usually http://127.0.0.1\nType it and hit enter:\n\n$ ` );
    var rpc_port = await prompt( `\n============================\n\nEnter the rpc port for your copy of bitcoind. Note that it is usually 8332\nType it and hit enter:\n\n$ ` );
    var rpc_username = await prompt( `\n============================\n\nEnter the rpc username for your copy of bitcoind\nType it and hit enter:\n\n$ ` );
    var rpc_password = await prompt( `\n============================\n\nEnter the rpc password for your copy of bitcoind\nType it and hit enter:\n\n$ ` );

    //test the user's rpc info
    try {
        var method = 'getnetworkinfo';
        var params = [];
        var json = await queryCore( method, params, rpc_hostname, rpc_port, rpc_username, rpc_password );
    } catch ( e ) {
        return console.log( '\n============================\n\nThere was an error in one or more of your answers, or bitcoind is not running. Please ensure bitcoind is running, be careful when you type your answers, and restart this app to try again.' );
    }

    //tell the user to run bitcoind with the URSF-110 signal, if they are not already doing so
    if ( !json.result.subversion.includes( "URSF-110" ) ) return console.log( '\n============================\n\nThis app needs you to add a comment to your user agent string indicating to the network that you are running the User Rejected Soft Fork against BIP110. To signal this, run bitcoind with -uacomment="URSF-110" or add the following line to your bitcoin configuration file, and restart bitcoind:\n\nuacomment="URSF-110"\n\nThen run this app again' );

    //check what network the user is running on
    var method = 'getblockchaininfo';
    var params = [];
    var json = await queryCore( method, params, rpc_hostname, rpc_port, rpc_username, rpc_password );

    //throw an error if the user is on an unsupported chain
    var network = json.result.chain;
    var blockheight = json.result.blocks;
    if ( network !== "regtest" && network !== "main" ) return console.log( '\n============================\n\nThis app only works on mainnet or regtest, and you are running your copy of bitcoind on some network other than those. Please set up bitcoind to run on mainnet or regtest and restart.' );

    //tell the user what happens next
    if ( network === "regtest" ) {
        console.log( `\n============================\n\nThis app detected that you are running on regtest at blockheight ${blockheight}. It will now do the following test: it will pretend a 2015 block “signaling window” begins in the next block. BIP110 activates if 55% of miners signal in favor of it during this window, which means BIP110 is “waiting for” 1109 blocks during this period to signal for it. What this app will do is, check the next 2015 blocks on your regtest node to see if they signal for BIP110; for any that do, this app will increment an internal counter. If, during the next 2015 blocks, the counter never gets to 1109, nothing happens. But if it *does* get to 1109, this app will automatically run the “invalidateblock” command on the 1109th pro-BIP110 block. Thus, your node will “reject” any blocks that would otherwise trigger the activation of BIP110.` );
    } else {
        console.log( `\n============================\n\nThis app detected that you are running on mainnet at blockheight ${blockheight}. It will now do the following: it will find out which of BIP110’s 2015 block “signaling windows” you are in (the next one happens at blockheight ${( blockheight + ( 2016 - ( blockheight % 2016 ) ) )}). BIP110 activates if 55% of miners signal in favor of it during any signaling window, which means BIP110 is “waiting for” 1109 blocks during any such window to signal for it. What this app will do is, check each set of 2015 blocks during any given window to see which blocks signal for BIP110; for any that do, this app will increment an internal counter. If, during those 2015 blocks, the counter never gets to 1109, nothing happens. But if it *does* get to 1109, this app will automatically run the “invalidateblock” command on the 1109th pro-BIP110 block in that signaling window. Thus, your node will “reject” any blocks that would otherwise trigger the activation of BIP110. If enough people join you in preventing this activation, your side can win.` );
    }

    //do what you just said you would do
    if ( network === "regtest" ) {
        var start_blockheight = blockheight + 1;
        var last_used_timestamp = Math.floor( Date.now() / 1000 );
        console.log( `============================` );
        console.log( `` );
        console.log( `Current blockheight: ${blockheight}` );
        console.log( `` );
        console.log( `Now it is time to mine some blocks. Pick a type: for pro-BIP110 blocks, type P. For anti-BIP110 blocks, type A` );
        var first_eleven_done = false;
        var last_few_timestamps = [];
        var loop = async () => {
            var type_to_mine = String( await prompt( `\nEnter P or A:\n\n$ ` ) ).toLowerCase();
            console.log( `` );
            console.log( `============================` );
            var num_to_mine = Number( await prompt( `\nHow many blocks of this type do you want to mine?\n\nEnter a number:\n\n$ ` ) );
            console.log( `` );
            console.log( `============================` );
            console.log( `` );

            //make the blocks
            var i; for ( i=0; i<num_to_mine; i++ ) {
                var addy = null;
                var current_blockheight = blockheight + i;
                var pro_bip110 = type_to_mine === "p" ? true : false;
                var timestamp = last_used_timestamp > Math.floor( Date.now() / 1000 ) ? last_used_timestamp : Math.floor( Date.now() / 1000 );
                if ( i<11 ) timestamp = timestamp + 1;
                last_used_timestamp = timestamp;
                last_few_timestamps.push( timestamp );
                if ( last_few_timestamps.length > 11 ) last_few_timestamps.splice( 0, 1 );
                if ( last_few_timestamps.length === 11 ) {
                    var mtp = last_few_timestamps.sort()[ 5 ];
                    timestamp = mtp + 1;
                    last_used_timestamp = timestamp;
                }
                var [ coinbase, header, header_hash, target ] = await makeBlock( addy, current_blockheight, pro_bip110, timestamp, rpc_hostname, rpc_port, rpc_username, rpc_password );
                var block = `${header}01${tapscript.Tx.encode( coinbase ).hex}`;
                var method = 'submitblock';
                var params = [ block ];
                var json = await queryCore( method, params, rpc_hostname, rpc_port, rpc_username, rpc_password );
                console.log( `mined ${i+1} blocks out of ${num_to_mine}` );
            }

            //get the current blockheight
            var method = 'getblockchaininfo';
            var params = [];
            var json = await queryCore( method, params, rpc_hostname, rpc_port, rpc_username, rpc_password );
            var current_blockheight = json.result.blocks;

            //if the blockheight has not changed, do nothing
            if ( current_blockheight <= blockheight ) {
                await waitSomeTime( 1_000 );
                return loop();
            }

            //otherwise, do the following things:

            //set the in-app blockheight to the new blockheight
            blockheight = current_blockheight;

            //get all blockhashes since the start height
            var blockhashes = [];
            var i; for ( i=0; i<current_blockheight + 1 - start_blockheight; i++ ) {
                var method = 'getblockhash';
                var params = [ start_blockheight + i ];
                var json = await queryCore( method, params, rpc_hostname, rpc_port, rpc_username, rpc_password );
                blockhashes.push( json.result );
            }

            //get the version hex for each one
            var block_header_version_hexes = [];
            var i; for ( i=0; i<blockhashes.length; i++ ) {
                var method = 'getblockheader';
                var params = [ blockhashes[ i ] ];
                var json = await queryCore( method, params, rpc_hostname, rpc_port, rpc_username, rpc_password );
                block_header_version_hexes.push( json.result.versionHex );
            }

            //extract the fourth bit from each block's version hex
            var block_header_version_binary = [];
            block_header_version_hexes.forEach( hex => block_header_version_binary.push( hexToBinary( hex ) ) );
            var fourth_bits = [];
            block_header_version_binary.forEach( bin => fourth_bits.push( Number( bin.split( "" ).reverse()[ 3 ] ) ) );

            //check how many blocks signaled for BIP110
            var counter = 0;
            fourth_bits.forEach( ( int, idx ) => {
                if ( int ) counter = counter + 1;
                //do nothing if the counter has not reached 1109
                if ( counter !== 1109 ) return;
                //otherwise, invalidate the 1109th block
                var method = 'invalidateblock';
                var params = [ blockhashes[ idx ] ];
                queryCore( method, params, rpc_hostname, rpc_port, rpc_username, rpc_password );
                blockheight = blockheight - 1;
                current_blockheight = current_blockheight - 1;
                counter = counter - 1;
                //tell the user what happened
                console.log( `` );
                console.log( `============================` );
                console.log( `URSF enforced! The 1109th block that signaled for BIP110 was rejected` );
                console.log( `============================` );
            });

            //tell the user the results
            console.log( '\n============================\n\nstart height:', start_blockheight, '\nend height:', end_blockheight );
            console.log( 'current height:', current_blockheight );
            console.log( `number of blocks signaling for BIP110:`, counter, 'out of', current_blockheight + 1 - start_blockheight );

            //rerun the loop if the signaling period has not ended yet
            if ( current_blockheight <= start_blockheight + 2016 ) {
                await waitSomeTime( 1_000 );
                return loop();
            }
        }
        await loop();
    } else {
        var end_blockheight = 0;
        var blockheight_changed = false;
        var loop = async () => {
            //find out which of BIP110’s 2015 block “signaling windows” the user is in
            var current_blockheight = blockheight;
            var start_blockheight = current_blockheight - ( current_blockheight % 2016 );

            //if the blockheight has not changed and you've already set an end blockheight, do nothing
            if ( current_blockheight <= blockheight && end_blockheight && !blockheight_changed ) {
                var method = 'getblockchaininfo';
                var params = [];
                var json = await queryCore( method, params, rpc_hostname, rpc_port, rpc_username, rpc_password );
                var blockheight_now = json.result.blocks;
                if ( blockheight_now !== blockheight ) {
                    blockheight_changed = true;
                    blockheight = json.result.blocks;
                }
                await waitSomeTime( 1_000 );
                return loop();
            }

            //otherwise, do the following things:

            //set the blockheight_changed variable to false
            blockheight_changed = false;

            //set the end blockheight
            if ( !end_blockheight ) end_blockheight = start_blockheight + 2016;

            //set the in-app blockheight to the new blockheight
            blockheight = current_blockheight;

            //get all blockhashes since the start height
            var blockhashes = [];
            var i; for ( i=0; i<current_blockheight + 1 - start_blockheight; i++ ) {
                var method = 'getblockhash';
                var params = [ start_blockheight + i ];
                var json = await queryCore( method, params, rpc_hostname, rpc_port, rpc_username, rpc_password );
                blockhashes.push( json.result );
            }

            //get the version hex for each one
            var block_header_version_hexes = [];
            var i; for ( i=0; i<blockhashes.length; i++ ) {
                var method = 'getblockheader';
                var params = [ blockhashes[ i ] ];
                var json = await queryCore( method, params, rpc_hostname, rpc_port, rpc_username, rpc_password );
                block_header_version_hexes.push( json.result.versionHex );
            }

            //extract the fourth bit from each block's version hex
            var block_header_version_binary = [];
            block_header_version_hexes.forEach( hex => block_header_version_binary.push( hexToBinary( hex ) ) );
            var fourth_bits = [];
            block_header_version_binary.forEach( bin => fourth_bits.push( Number( bin.split( "" ).reverse()[ 3 ] ) ) );

            //check how many blocks signaled for BIP110
            var counter = 0;
            fourth_bits.forEach( ( int, idx ) => {
                if ( int ) counter = counter + 1;
                //do nothing if the counter has not reached 1109
                if ( counter !== 1109 ) return;
                //otherwise, invalidate the 1109th block
                var method = 'invalidateblock';
                var params = [ blockhashes[ idx ] ];
                queryCore( method, params, rpc_hostname, rpc_port, rpc_username, rpc_password );
                blockheight = blockheight - 1;
                current_blockheight = current_blockheight - 1;
                counter = counter - 1;
                //tell the user what happened
                console.log( `` );
                console.log( `============================` );
                console.log( `URSF enforced! The 1109th block that signaled for BIP110 was rejected` );
                console.log( `============================` );
            });

            //tell the user the results
            console.log( '\n============================\n\nstart height:', start_blockheight, '\nend height:', end_blockheight );
            console.log( 'current height:', current_blockheight );
            console.log( `number of blocks signaling for BIP110:`, counter, 'out of', current_blockheight + 1 - start_blockheight );

            //stop the app if we are well past the activation blockheight
            if ( current_blockheight > 966000 ) return console.log( 'the app is done running now because we are well past the BIP110 activation height' );

            //if the signaling period ended, blank the end_blockheight to make everything start over for the next epoch
            if ( current_blockheight > end_blockheight ) end_blockheight = 0;

            //rerun the loop
            console.log( '\n============================\n\nWaiting for blocks...' );
            var method = 'getblockchaininfo';
            var params = [];
            var json = await queryCore( method, params, rpc_hostname, rpc_port, rpc_username, rpc_password );
            blockheight = json.result.blocks;
            await waitSomeTime( 1_000 );
            return loop();
        }
        await loop();
    }
})();
