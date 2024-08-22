import { Address } from "@ton/core";
import { JettonSender } from "./jetton";

async function main() {
    const mnemonic = process.env.MNEMONIC!;
    const endpoint = "https://sandbox.tonhubapi.com/jsonRPC";
    const jettonMaster = Address.parse("kQCc-HRGt7thbOHkNBEC_VOvQLs12zmus8sSs5p-e5d2v730");
    const destination = Address.parse("0QCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqPvC");
    const amount = BigInt(100000); // raw amount

    const sender = await JettonSender.create(mnemonic, endpoint, jettonMaster);
    await sender.send({
        destination,
        amount,
    });
}

main();