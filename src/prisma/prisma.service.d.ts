import { OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import { PrismaClient as PrismaClientOnline } from "../../dist/generated/client-online";
export declare class PrismaService implements OnModuleInit, OnModuleDestroy {
    prismaOnline: PrismaClientOnline;
    constructor();
    onModuleInit(): Promise<void>;
    onModuleDestroy(): Promise<void>;
    executeQuery(query: () => Promise<any>): Promise<any>;
}
