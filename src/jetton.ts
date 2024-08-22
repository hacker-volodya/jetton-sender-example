import { Address, Builder, Cell, internal, OpenedContract } from "@ton/core";
import { KeyPair, mnemonicToWalletKey } from "@ton/crypto";
import { JettonMaster, TonClient, WalletContractV4 } from "@ton/ton";

type Coins = number | bigint;

interface JettonTransfer {
    // address of destination user wallet (not jetton wallet!)
    destination: Address

    // raw amount of jetton tokens to transfer
    amount: Coins,

    // send excess to this address (sender wallet by default)
    responseDestination?: Address,

    // payload for custom jetton logic, unneeded for ordinary jettons
    customPayload?: Cell,

    // text comment for user or binary payload for smart contract invocation
    forwardPayload?: Cell,

    // set this to value > 0 if want to notify user wallet about incoming jetton
    forwardAmount?: Coins,
}

class JettonSender {
    private key: KeyPair;
    private walletContract: OpenedContract<WalletContractV4>;
    private jettonWallet: Address;

    public static async create(mnemonic: string, endpoint: string, jettonMaster: Address): Promise<JettonSender> {
        const key = await mnemonicToWalletKey(mnemonic.split(" "));
        const wallet = WalletContractV4.create({ publicKey: key.publicKey, workchain: 0 });
        const client = new TonClient({ endpoint });
        const walletContract = client.open(wallet);
        const jettonMasterContract = client.open(JettonMaster.create(jettonMaster));
        const jettonWallet = await jettonMasterContract.getWalletAddress(walletContract.address);
        return new JettonSender(key, walletContract, jettonWallet);
    }

    public async send(transfer: JettonTransfer): Promise<void> {
        // fetch our wallet current seqno from blockchain (due to this thing, operations on v4 wallet must not be executed in parallel)
        const seqno = await this.walletContract.getSeqno();

        // construct, sign and send external message
        await this.walletContract.sendTransfer({
            secretKey: this.key.secretKey,
            seqno: seqno,
            messages: [
                internal({
                    to: this.jettonWallet,
                    value: "0.05", // 0.05 TON for gas fee
                    body: this.createTransferBody(transfer),
                    bounce: true,
                })
            ]
        });

        // wait until confirmed, seqno must increment on successful transaction
        let currentSeqno = seqno;
        while (currentSeqno == seqno) {
            await JettonSender.sleep(1500);
            currentSeqno = await this.walletContract.getSeqno();
        }
    }

    private constructor(key: KeyPair, walletContract: OpenedContract<WalletContractV4>, jettonWallet: Address) {
        this.key = key;
        this.walletContract = walletContract;
        this.jettonWallet = jettonWallet;
    }

    private static generateQueryId(): bigint {
        const now = Math.floor(Date.now() / 1000);
        const random = Math.floor(Math.random() * Math.pow(2, 30));
        return (BigInt(now) << 32n) | BigInt(random);
    }

    private createTransferBody(
        transfer: JettonTransfer
    ): Cell {
        // https://github.com/ton-blockchain/TEPs/blob/master/text/0074-jettons-standard.md#1-transfer

        const body = new Builder();

        // transfer#0f8a7ea5
        body.storeUint(0x0f8a7ea5, 32);

        // query_id:uint64
        body.storeUint(JettonSender.generateQueryId(), 64);

        // amount:(VarUInteger 16)
        body.storeCoins(transfer.amount);

        // destination:MsgAddress
        body.storeAddress(transfer.destination);

        // response_destination:MsgAddress
        body.storeAddress(transfer.responseDestination ?? this.walletContract.address);

        // custom_payload:(Maybe ^Cell)
        if (transfer.customPayload) {
            body.storeBit(1);
            body.storeRef(transfer.customPayload);
        } else {
            body.storeBit(0);
        }

        // forward_ton_amount:(VarUInteger 16)
        body.storeCoins(transfer.forwardAmount ?? 0);

        // forward_payload:(Either Cell ^Cell)
        if (transfer.forwardPayload) {
            body.storeBit(1);
            body.storeRef(transfer.forwardPayload);
        } else {
            body.storeBit(0);
        }

        return body.endCell();
    }

    private static sleep(ms: number) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }    
}

export {JettonSender};
export type {JettonTransfer};
