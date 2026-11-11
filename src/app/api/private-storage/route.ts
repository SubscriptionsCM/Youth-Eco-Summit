import { privateStorageAction } from '@/server/storage/transfer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: Request) { return privateStorageAction(request); }
export async function HEAD(request: Request) { return privateStorageAction(request); }
export async function PUT(request: Request) { return privateStorageAction(request); }
