from pyrogram import Client

api_id = int(input("Masukkan API ID: "))
api_hash = input("Masukkan API HASH: ")

with Client("userbot", api_id=api_id, api_hash=api_hash) as app:
    print("\nSESSION_STRING:")
    print(app.export_session_string())
