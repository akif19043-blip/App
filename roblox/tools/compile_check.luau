-- Bütün .luau dosyalarını derleyerek sözdizimi hatası arar.
local fs = require("@lune/fs")
local luau = require("@lune/luau")
local process = require("@lune/process")

local failures = 0
local count = 0
local function walk(dir)
	for _, name in ipairs(fs.readDir(dir)) do
		local path = dir .. "/" .. name
		if fs.isDir(path) then
			walk(path)
		elseif string.sub(name, -5) == ".luau" then
			count += 1
			local ok, err = pcall(luau.compile, fs.readFile(path))
			if not ok then
				failures += 1
				print("HATA " .. path .. ": " .. tostring(err))
			end
		end
	end
end
for _, dir in ipairs(process.args) do
	walk(dir)
end
print(string.format("%d dosya derlendi, %d hata", count, failures))
process.exit(failures == 0 and 0 or 1)
