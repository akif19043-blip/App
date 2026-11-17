-- Ortak mantık ve harita testleri: silahlar, eklentiler, rütbeler, teçhizat
-- doğrulaması, balistik, silah modelleri ve haritada doğuş noktalarının
-- açık alanda olması.

local process = require("@lune/process")

local Harness = require("./harness")

local check = Harness.check
local game = Harness.load(process.args[1])
local roblox = Harness.roblox
local Vector3 = roblox.Vector3
local CFrame = roblox.CFrame

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Shared = ReplicatedStorage:FindFirstChild("Shared")
local Server = game:GetService("ServerScriptService"):FindFirstChild("Server")

local ok, problem = pcall(function()
	local Attachments = Harness.require(Shared.Attachments)
	local Ballistics = Harness.require(Shared.Ballistics)
	local GunModels = Harness.require(Shared.GunModels)
	local Loadout = Harness.require(Shared.Loadout)
	local Modes = Harness.require(Shared.Modes)
	local Ranks = Harness.require(Shared.Ranks)
	local Weapons = Harness.require(Shared.Weapons)

	print("Silah tanımları")
	local required = {
		"id",
		"name",
		"class",
		"slot",
		"unlockRank",
		"damage",
		"minDamage",
		"falloffStart",
		"falloffEnd",
		"headMult",
		"limbMult",
		"rpm",
		"fireMode",
		"magSize",
		"reserve",
		"reloadTime",
		"adsTime",
		"adsFov",
		"hipSpread",
		"adsSpread",
		"bloom",
		"maxBloom",
		"recoilV",
		"recoilH",
		"range",
		"speedMult",
		"pellets",
		"sound",
		"model",
	}
	local missing = {}
	for id, def in pairs(Weapons.Defs) do
		for _, field in ipairs(required) do
			if def[field] == nil then
				table.insert(missing, id .. "." .. field)
			end
		end
		if def.id ~= id then
			table.insert(missing, id .. " kimliği uyuşmuyor")
		end
		if def.falloffEnd <= def.falloffStart then
			table.insert(missing, id .. " hasar düşüşü aralığı ters")
		end
		if def.minDamage > def.damage then
			table.insert(missing, id .. " uzak hasar yakından büyük")
		end
	end
	check("her silahın bütün alanları dolu", #missing == 0, table.concat(missing, ", "))
	check("8 ana silah, 3 yan silah", #Weapons.Primaries == 8 and #Weapons.Secondaries == 3)
	for _, id in ipairs(Weapons.Primaries) do
		assert(Weapons.Defs[id].slot == "primary", id)
	end
	check(
		"başlangıçta en az iki ana silah açık",
		(function()
			local count = 0
			for _, id in ipairs(Weapons.Primaries) do
				if Weapons.Defs[id].unlockRank == 1 then
					count += 1
				end
			end
			return count >= 2
		end)()
	)
	for _, id in ipairs(Modes.Defs.gg.tiers) do
		assert(Weapons.Defs[id], "Silah Yarışı'nda bilinmeyen silah: " .. id)
	end
	check("Silah Yarışı son silahı bıçak", Modes.Defs.gg.tiers[#Modes.Defs.gg.tiers] == Weapons.Melee)

	print("\nEklentiler")
	local stats = Weapons.resolve("bora", { sight = "scope4", barrel = "compensator", grip = "vgrip", mag = "extmag" })
	local base = Weapons.Defs.bora
	check("dürbün görüş açısını değiştirir", stats.adsFov == 24)
	check(
		"kompansatör ve dikey kabza dikey tepmeyi azaltır",
		math.abs(stats.recoilV - base.recoilV * 0.82 * 0.88) < 1e-6
	)
	check("uzatılmış şarjör 40 mermi", stats.magSize == 40, stats.magSize)
	check("asıl tanım değişmedi", base.magSize == 30 and base.adsFov == 52)
	local bad = Weapons.resolve("dogan", { sight = "reddot", barrel = "suppressor", grip = "vgrip" })
	check(
		"uymayan eklenti atılır (keskin nişancıya kırmızı nokta)",
		bad.attachments.sight == nil and bad.attachments.grip == nil
	)
	check(
		"uyan eklenti kalır (keskin nişancıya susturucu)",
		bad.attachments.barrel == "suppressor" and bad.suppressed
	)
	local wrongSlot = Weapons.resolve("bora", { sight = "suppressor" })
	check("yanlış yuvaya eklenti takılmaz", wrongSlot.attachments.sight == nil)

	print("\nRütbeler")
	local increasing = true
	for rank = 2, Ranks.Max do
		if Ranks.xpFor(rank) <= Ranks.xpFor(rank - 1) then
			increasing = false
		end
	end
	check("rütbe eşikleri artan", increasing)
	check("0 puan = Er", Ranks.fromXp(0) == 1 and Ranks.name(1) == "Er")
	check("eşikte rütbe atlanır", Ranks.fromXp(Ranks.xpFor(5)) == 5 and Ranks.fromXp(Ranks.xpFor(5) - 1) == 4)
	check("en yüksek rütbe Mareşal", Ranks.name(Ranks.Max) == "Mareşal" and Ranks.fromXp(1e9) == Ranks.Max)
	local maxUnlock = 0
	for _, def in pairs(Weapons.Defs) do
		maxUnlock = math.max(maxUnlock, def.unlockRank)
	end
	check("bütün silahlar ulaşılabilir rütbelerde", maxUnlock <= Ranks.Max)
	print(
		string.format(
			"    (son silah %d. rütbede: %d puan ≈ %d leş)",
			maxUnlock,
			Ranks.xpFor(maxUnlock),
			Ranks.xpFor(maxUnlock) // 130
		)
	)

	print("\nTeçhizat doğrulama")
	local rookie = { xp = 0, weaponKills = {} }
	local clean = Loadout.sanitize(
		rookie,
		{ primary = "dogan", secondary = "engerek", attachments = { bora = { sight = "reddot" } } }
	)
	check("kilitli silahlar varsayılana döner", clean.primary == "bora" and clean.secondary == "akrep")
	check("kilitli eklenti atılır", clean.attachments.bora == nil)
	local veteran = { xp = Ranks.xpFor(6), weaponKills = { dogan = 20 } }
	clean = Loadout.sanitize(veteran, {
		primary = "dogan",
		secondary = "engerek",
		attachments = { dogan = { barrel = "suppressor", sight = "reddot" } },
	})
	check(
		"açık silah ve eklenti kalır",
		clean.primary == "dogan" and clean.secondary == "engerek" and clean.attachments.dogan.barrel == "suppressor"
	)
	check("uymayan eklenti açık olsa da atılır", clean.attachments.dogan.sight == nil)
	clean = Loadout.sanitize(veteran, { primary = "akrep", secondary = "bora", attachments = "çöp" })
	check("yuvası yanlış silah reddedilir", clean.primary == "bora" and clean.secondary == "akrep")
	clean = Loadout.sanitize(veteran, nil)
	check("boş istek varsayılan teçhizat verir", clean.primary == "bora")

	print("\nBalistik")
	local bora = Weapons.resolve("bora", nil)
	check("yakında tam hasar", Ballistics.damageAt(bora, 10) == bora.damage)
	check("uzakta en düşük hasar", Ballistics.damageAt(bora, 1000) == bora.minDamage)
	local mid = Ballistics.damageAt(bora, (bora.falloffStart + bora.falloffEnd) / 2)
	check("arada doğrusal düşüş", math.abs(mid - (bora.damage + bora.minDamage) / 2) < 1e-6)
	check("kask = kafa", Ballistics.zoneOf("Helmet") == "head")
	check("yelek = gövde", Ballistics.zoneOf("Vest") == "torso")
	check("bacak = uzuv", Ballistics.zoneOf("LeftUpperLeg") == "limb")
	local hip = Ballistics.spreadDegrees(bora, { aim = 0 })
	local ads = Ballistics.spreadDegrees(bora, { aim = 1 })
	local crouch = Ballistics.spreadDegrees(bora, { aim = 0, crouching = true })
	local jump = Ballistics.spreadDegrees(bora, { aim = 0, airborne = true })
	check("nişan dağılmayı azaltır", ads < hip / 5)
	check("eğilmek dağılmayı azaltır", crouch < hip)
	check("zıplamak dağılmayı artırır", jump > hip)
	local forward = Vector3.new(0, 0, -1)
	local worst = 1
	for index = 1, 200 do
		local direction = Ballistics.spreadDirection(forward, 3, (index % 17) / 17, (index % 23) / 23)
		worst = math.min(worst, direction:Dot(forward))
	end
	check("sapma 3 derecelik koninin içinde", worst >= math.cos(math.rad(3)) - 1e-6, worst)

	-- Denge tablosu: tam cana kaç isabet (gövde / kafa) ve öldürme süresi
	print("\n    silah          10m gövde  10m kafa  50m gövde  öldürme(sn)")
	for _, id in ipairs({
		"bora",
		"kasirga",
		"tunc",
		"dogan",
		"balyoz",
		"firtina",
		"yildirim",
		"poyraz",
		"akrep",
		"engerek",
		"ari",
	}) do
		local s = Weapons.resolve(id, nil)
		local function hits(distance, part)
			local perShot = Ballistics.damageFor(s, distance * 3.5, part) * s.pellets
			return math.ceil(100 / perShot)
		end
		local body = hits(10, "UpperTorso")
		print(
			string.format(
				"    %-14s %6d  %9d  %9d  %10.2f",
				s.name,
				body,
				hits(10, "Head"),
				hits(50, "UpperTorso"),
				(body - 1) * 60 / s.rpm
			)
		)
		assert(body >= 1 and body <= 9, id .. " dengesiz: " .. body)
	end

	print("\nSilah modelleri")
	local built = 0
	local muzzleOk = true
	for id, def in pairs(Weapons.Defs) do
		local combos = { {} }
		for _, slot in ipairs(Attachments.Slots) do
			for _, attId in ipairs(Attachments.optionsFor(def, slot)) do
				table.insert(combos, { [slot] = attId })
			end
		end
		for _, combo in ipairs(combos) do
			local resolved = Weapons.resolve(id, combo)
			local model, info = GunModels.build(resolved, {})
			built += 1
			if not def.melee and info.muzzle.Z >= info.aim.Z then
				muzzleOk = false
			end
			local world = GunModels.build(resolved, { world = true })
			assert(world.PrimaryPart and world.PrimaryPart.Name == "Handle", id)
			model:Destroy()
			world:Destroy()
		end
	end
	check(string.format("bütün silah×eklenti modelleri kuruldu (%d)", built), built > 60)
	check("namlu ucu nişangâhın önünde", muzzleOk)

	print("\nHarita yerleşimi")
	local MapBuilder = Harness.require(Server.MapBuilder)
	local workspace = game:GetService("Workspace")
	local data = MapBuilder.build(workspace)
	check("iki takımın da 10 doğuş noktası var", #data.spawns.Sahin == 10 and #data.spawns.Ejder == 10)
	check("herkes tek için 20 doğuş noktası", #data.ffaSpawns == 20)
	check("A, B, C bölgeleri", #data.points == 3 and data.points[1].letter == "A" and data.points[3].letter == "C")
	check(
		"harita simetrik (A ile C karşılıklı)",
		(data.points[1].position + data.points[3].position).Magnitude < 1e-3
	)

	-- Bir kutunun içine giren katı parçaları bul (dönmüş parçalar için köşelerden AABB)
	local solids = {}
	for _, part in ipairs(data.folder:GetChildren()) do
		if part:IsA("BasePart") and part.CanCollide and part.Name ~= "Ground" and part.Name ~= "Boundary" then
			local cf, size = part.CFrame, part.Size / 2
			local minV, maxV =
				Vector3.new(math.huge, math.huge, math.huge), Vector3.new(-math.huge, -math.huge, -math.huge)
			for _, sx in ipairs({ -1, 1 }) do
				for _, sy in ipairs({ -1, 1 }) do
					for _, sz in ipairs({ -1, 1 }) do
						local corner = cf * Vector3.new(size.X * sx, size.Y * sy, size.Z * sz)
						minV = minV:Min(corner)
						maxV = maxV:Max(corner)
					end
				end
			end
			table.insert(solids, { part = part, min = minV, max = maxV })
		end
	end
	local function blockedAt(position, half)
		local lo, hi = position - half, position + half
		for _, solid in ipairs(solids) do
			if
				lo.X < solid.max.X
				and hi.X > solid.min.X
				and lo.Y < solid.max.Y
				and hi.Y > solid.min.Y
				and lo.Z < solid.max.Z
				and hi.Z > solid.min.Z
			then
				return solid.part
			end
		end
		return nil
	end
	local body = Vector3.new(1.6, 2.4, 1.6)
	local stuck = {}
	for teamId, list in pairs(data.spawns) do
		for index, spawn in ipairs(list) do
			local hit = blockedAt(spawn.Position, body)
			if hit then
				table.insert(stuck, string.format("%s#%d %s (%s)", teamId, index, tostring(spawn.Position), hit.Name))
			end
		end
	end
	for index, spawn in ipairs(data.ffaSpawns) do
		local hit = blockedAt(spawn.Position, body)
		if hit then
			table.insert(stuck, string.format("ffa#%d %s (%s)", index, tostring(spawn.Position), hit.Name))
		end
	end
	check("doğuş noktaları boşlukta", #stuck == 0, table.concat(stuck, "; "))
	local buried = {}
	for _, point in ipairs(data.points) do
		local hit = blockedAt(point.position + Vector3.new(0, 3, 0), Vector3.new(2, 2.4, 2))
		if hit then
			table.insert(buried, point.letter .. " (" .. hit.Name .. ")")
		end
	end
	check("bölge merkezleri boşlukta", #buried == 0, table.concat(buried, "; "))
	local hot = {}
	for index, position in ipairs(data.hotspots) do
		local hit = blockedAt(position, Vector3.new(1.5, 2, 1.5))
		if hit then
			table.insert(hot, index .. " (" .. hit.Name .. ")")
		end
	end
	check("bot hedef noktaları boşlukta", #hot == 0, table.concat(hot, "; "))
	local inside = true
	for _, spawn in ipairs(data.ffaSpawns) do
		local p = spawn.Position
		if math.abs(p.X) > data.bounds.x or math.abs(p.Z) > data.bounds.z then
			inside = false
		end
	end
	check("doğuş noktaları sınırın içinde", inside)
	local _ = CFrame
end)

if not ok then
	print("TEST DURDU: " .. tostring(problem))
	Harness.failed += 1
end
process.exit(Harness.finish() and 0 or 1)
