-- Sunucu duman testi: sunucunun asıl kodunu çalıştırır, bir oyuncu bağlar ve
-- üç modu sırayla oynatır. Süreler test için kısaltılır.

local process = require("@lune/process")
local task = require("@lune/task")

local Harness = require("./harness")

local check = Harness.check
local game = Harness.load(process.args[1])
local roblox = Harness.roblox
local Vector3 = roblox.Vector3
local CFrame = roblox.CFrame

local workspace = game:GetService("Workspace")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Players = game:GetService("Players")
local Server = game:GetService("ServerScriptService"):FindFirstChild("Server")
local Remotes = ReplicatedStorage:FindFirstChild("Remotes")
local State = ReplicatedStorage:FindFirstChild("State")

local function find(root, predicate)
	for _, item in ipairs(root:GetDescendants()) do
		if predicate(item) then
			return item
		end
	end
	return nil
end

local function remote(name)
	return Harness.signal(Remotes:FindFirstChild(name), "OnServerEvent")
end

-- Süreleri kısalt
local Config = Harness.require(ReplicatedStorage.Shared.Config)
Config.FirstIntermission = 1
Config.Intermission = 1
Config.EndScreen = 1
Config.RespawnDelay = 0.4
Config.SpawnProtection = 0.1
Config.GrenadeFuse = 0.3
Config.CaptureTime = 0.8
Config.FillPerTeam = 3
Config.FillFreeForAll = 2
local Modes = Harness.require(ReplicatedStorage.Shared.Modes)
Modes.Defs.tdm.target = 500 -- botların leşleri turu erken bitirmesin
Modes.Defs.tdm.duration = 40
Modes.Defs.dom.duration = 10
Modes.Defs.gg.duration = 30

-- Sıcaklık: karakterlerin ve el bombalarının Position'ı sürekli eşitlenir
local syncing = true
task.spawn(function()
	while syncing do
		for _, child in ipairs(workspace:GetChildren()) do
			if child:IsA("Model") or child.Name == "Projectiles" then
				Harness.syncPositions(child)
			end
		end
		task.wait(0.03)
	end
end)

local ok, problem = pcall(function()
	print("Sunucu başlatılıyor")
	Harness.run(Server.Main)
	Harness.waitFor("harita kurulur", 10, function()
		return workspace:FindFirstChild("Map") ~= nil
	end)

	local Entities = Harness.require(Server.Entities)
	local Bots = Harness.require(Server.Bots)
	local PlayerData = Harness.require(Server.PlayerData)
	local Ranks = Harness.require(ReplicatedStorage.Shared.Ranks)

	print("\nHarita")
	local map = workspace.Map
	local partCount = #map:GetChildren()
	check("harita parçaları kuruldu", partCount > 500, partCount)
	check("Points klasörü TÖM'de sahnede değil", workspace:FindFirstChild("Points") == nil)
	check("Projectiles klasörü var", workspace:FindFirstChild("Projectiles") ~= nil)
	check("takımlar oluşturuldu", #game:GetService("Teams"):GetChildren() == 2)

	print("\nOyuncu katılır")
	local player = Harness.addPlayer("Deneme", 1001)
	Harness.signal(Players, "PlayerAdded"):Fire(player)
	Harness.waitFor("oyuncu kaydı", 5, function()
		return Entities.byPlayer[player] ~= nil
	end)
	local me = Entities.byPlayer[player]
	check("takıma atandı", player:GetAttribute("TeamId") == "Sahin" or player:GetAttribute("TeamId") == "Ejder")
	check("profil gönderildi", #Harness.sent("Profile", player) >= 1)
	check("leaderstats var", player:FindFirstChild("leaderstats") ~= nil)
	check("skor tablosu satırı var", State.Scoreboard:FindFirstChild(tostring(me.id)) ~= nil)

	Harness.waitFor("tur başlar", 6, function()
		return State:GetAttribute("Phase") == "Playing"
	end)
	check("ilk mod Takım Ölüm Maçı", State:GetAttribute("Mode") == "tdm")

	print("\nSahaya iniş")
	remote("Deploy"):Fire(player)
	Harness.waitFor("karakter iner", 5, function()
		return me.alive and player.Character ~= nil
	end)
	local spawned = Harness.sent("Spawned", player)
	check("Spawned teçhizatı gönderildi", #spawned == 1)
	local payload = spawned[1] and spawned[1][1]
	local ids = {}
	for _, entry in ipairs(payload and payload.weapons or {}) do
		table.insert(ids, entry.id)
	end
	check("teçhizat bora/akrep/kama", table.concat(ids, ",") == "bora,akrep,kama", table.concat(ids, ","))
	check("2 el bombası", payload and payload.grenades == 2)
	local character = player.Character
	check("kask giyildi", character:FindFirstChild("Helmet") ~= nil)
	check("yelek giyildi", character:FindFirstChild("Vest") ~= nil)
	check("elinde silah var", character:FindFirstChild("WorldGun") ~= nil)
	check("karakter takım özniteliği", character:GetAttribute("Team") == me.team)
	check("koruma kalkanı", character:FindFirstChildOfClass("ForceField") ~= nil)
	check(
		"oyuncu üniforma giydi",
		character.UpperTorso.Color == Harness.roblox.Color3.fromRGB(86, 98, 74)
			or character.UpperTorso.Color == Harness.roblox.Color3.fromRGB(132, 112, 82)
	)
	check("avatar görünümü kapalı", game:GetService("StarterPlayer").LoadCharacterAppearance == false)
	local root = character.HumanoidRootPart
	check("üs doğuş noktasında", math.abs(root.CFrame.Position.Z) > 150, root.CFrame.Position)

	print("\nBotlar")
	Harness.waitFor("botlar doğar", 6, function()
		local alive = 0
		for _, entity in ipairs(Entities.list) do
			if entity.isBot and entity.alive then
				alive += 1
			end
		end
		return alive >= 5
	end)
	check(
		"takımlar botla dolduruldu",
		Entities.count(nil, "bot") == Config.FillPerTeam * 2 - 1,
		Entities.count(nil, "bot")
	)
	-- Testte fizik yok, botlar yürümez: bir düşman botu oyuncunun 40 birim önüne al
	me.humanoid.MaxHealth = 5000
	me.humanoid.Health = 5000
	-- Takım arkadaşı botları uzağa al ki yaklaşan düşman yalnızca oyuncuyu görsün
	local moved = false
	for _, entity in ipairs(Entities.list) do
		if entity.isBot and entity.alive and entity.character then
			if entity.team == me.team then
				entity.character:PivotTo(
					CFrame.new(-150, 3, -player.Character.HumanoidRootPart.CFrame.Position.Z * 1.2)
				)
			elseif not moved then
				moved = true
				entity.character:PivotTo(player.Character.HumanoidRootPart.CFrame * CFrame.new(0, 0, -25))
			end
		end
	end
	Harness.waitFor("bot ateş eder", 6, function()
		return #Harness.sent("ShotFx") > 0
	end)
	check("botlar ateş etti", #Harness.sent("ShotFx") > 0, #Harness.sent("ShotFx"))
	local hurt = pcall(Harness.waitFor, "bot oyuncuyu vurur", 8, function()
		return #Harness.sent("Damaged", player) > 0
	end)
	check("bot oyuncuya hasar verdi", hurt and me.humanoid.Health < 5000, me.humanoid.Health)
	check("bot gövdesi sahnede", workspace:FindFirstChild(Entities.list[2].name) ~= nil)
	-- Testin geri kalanı belirli olsun diye botları durdur
	Bots.active = false
	task.wait(0.3)

	local function enemyBot()
		for _, entity in ipairs(Entities.list) do
			if entity.isBot and entity.alive and entity.team ~= me.team and entity.character then
				return entity
			end
		end
		return nil
	end

	local function myHead()
		Harness.syncPositions(player.Character)
		return player.Character.Head.Position
	end

	me.humanoid.MaxHealth = 100
	me.humanoid.Health = 100
	me.protectedUntil = 0

	print("\nAtış ve doğrulama")
	local target = enemyBot()
	target.protectedUntil = 0
	target.humanoid.Health = 100
	-- Hedefi 20 birim öne al: hasar düşüşü başlamadan
	target.character:PivotTo(player.Character.HumanoidRootPart.CFrame * CFrame.new(0, 0, -20))
	local head = target.character.Head
	Harness.syncPositions(target.character)
	local origin = myHead()
	local function shot(part, position)
		position = position or part.Position
		return { pos = position, dir = (position - origin).Unit, part = part }
	end

	remote("Fire"):Fire(player, "dogan", origin, { shot(head) })
	task.wait(0.05)
	check("sahip olunmayan silahla vuruş reddedildi", target.humanoid.Health == 100)
	remote("Fire"):Fire(player, "bora", origin + Vector3.new(0, 50, 0), { shot(head) })
	task.wait(0.05)
	check("uzaktan başlayan atış reddedildi", target.humanoid.Health == 100)
	remote("Fire"):Fire(player, "bora", origin, { shot(head, head.Position + Vector3.new(0, 30, 0)) })
	task.wait(0.05)
	check("parçadan uzak isabet reddedildi", target.humanoid.Health == 100)

	Harness.clearOutbox()
	remote("Fire"):Fire(player, "bora", origin, { shot(head) })
	task.wait(0.12)
	check("kafadan vuruş 42 hasar", math.abs(target.humanoid.Health - 58) < 0.01, target.humanoid.Health)
	local confirms = Harness.sent("HitConfirm", player)
	check("isabet onayı geldi", #confirms == 1 and confirms[1][1].headshot == true)
	check("atan oyuncuya kendi atışı geri yollanmadı", #Harness.sent("ShotFx", player) == 0)
	remote("Fire"):Fire(player, "bora", origin, { shot(target.character.UpperTorso) })
	task.wait(0.12)
	check("gövdeye 28 hasar", math.abs(target.humanoid.Health - 30) < 0.01, target.humanoid.Health)
	remote("Fire"):Fire(player, "bora", origin, { shot(head) })
	task.wait(0.15)
	check("hedef öldü", not target.alive)
	local corpse = target.character
	check("ceset ragdoll oldu (eklemler mafsala döndü)", corpse ~= nil and find(corpse, function(item)
		return item:IsA("BallSocketConstraint")
	end) ~= nil)
	check("eklem motorları kapandı", corpse ~= nil and find(corpse, function(item)
		return item:IsA("Motor6D") and item.Name == "Waist" and item.Enabled == false
	end) ~= nil)
	check("ceset savruldu", corpse ~= nil and corpse.UpperTorso.AssemblyLinearVelocity.Magnitude > 5)
	check("leş sayıldı", me.kills == 1, me.kills)
	check("öldürme akışı yayınlandı", #Harness.sent("KillFeed") == 1)
	check("takım skoru arttı", (State:GetAttribute("Score" .. me.team) or 0) >= 1)
	local xp = PlayerData.get(player).xp
	check("puan verildi (leş + kafadan)", xp >= Config.Xp.kill + Config.Xp.headshot, xp)
	check("silah leşi kaydedildi", PlayerData.get(player).weaponKills.bora == 1)
	check("ölen bota Died gönderilmedi (oyuncu değil)", #Harness.sent("Died") == 0)
	local weapon = me.weapons.bora
	check("şarjörden 4 mermi düştü (reddedilenler dahil 3 geçerli + 1 uzaktan)", weapon.mag <= 26, weapon.mag)

	print("\nAtış hızı sınırı")
	local target2 = enemyBot()
	target2.protectedUntil = 0
	target2.humanoid.Health = 100
	target2.character:PivotTo(player.Character.HumanoidRootPart.CFrame * CFrame.new(4, 0, -30))
	Harness.syncPositions(target2.character)
	origin = myHead()
	local before = weapon.mag
	for _ = 1, 10 do
		remote("Fire"):Fire(player, "bora", origin, { shot(target2.character.LeftUpperLeg) })
	end
	task.wait(0.05)
	check("aynı anda 10 atıştan en fazla 3'ü geçer", before - weapon.mag <= 3, before - weapon.mag)

	print("\nDolum")
	weapon.mag = 0
	remote("Reload"):Fire(player, "bora")
	task.wait(0.05)
	check("dolum başladı", weapon.reloadEnd ~= nil)
	remote("Fire"):Fire(player, "bora", origin, { shot(target2.character.LeftUpperLeg) })
	task.wait(0.05)
	check("dolum bitmeden atış yok", weapon.mag == 0)
	task.wait(Config.RespawnDelay + weapon.stats.reloadTime)
	remote("Fire"):Fire(player, "bora", origin, { shot(target2.character.LeftUpperLeg) })
	task.wait(0.05)
	check("dolumdan sonra şarjör doldu", weapon.mag == weapon.stats.magSize - 1, weapon.mag)

	print("\nBıçak")
	target2.humanoid.Health = 100
	local myRoot = player.Character.HumanoidRootPart
	target2.character:PivotTo(myRoot.CFrame * CFrame.new(0, 0, -3))
	Harness.syncPositions(target2.character)
	remote("Melee"):Fire(player, target2.character.HumanoidRootPart)
	task.wait(0.1)
	check("bıçak tek vuruşta öldürür", not target2.alive)
	check("ikinci leş", me.kills == 2, me.kills)

	print("\nEl bombası")
	local target3 = enemyBot()
	target3.protectedUntil = 0
	target3.humanoid.Health = 100
	target3.character:PivotTo(myRoot.CFrame * CFrame.new(3, 0, -6))
	Harness.syncPositions(target3.character)
	me.humanoid.MaxHealth = 1000
	me.humanoid.Health = 1000
	remote("Grenade"):Fire(player, myHead(), Vector3.new(0, 0, -1))
	task.wait(0.05)
	check("el bombası atıldı", #workspace.Projectiles:GetChildren() == 1)
	check("el bombası sayısı düştü", me.grenades == 1)
	task.wait(Config.GrenadeFuse + 0.3)
	check("patlama yayınlandı", #Harness.sent("Blast") == 1)
	check("yakındaki düşman öldü", not target3.alive)
	check("atan kendi bombasından hasar aldı", me.humanoid.Health < 1000, me.humanoid.Health)

	print("\nTur sonu")
	Modes.Defs.tdm.target = 1
	Harness.waitFor("TÖM hedefe ulaşınca biter", 5, function()
		return State:GetAttribute("Phase") == "Ended"
	end)
	local mine = State:GetAttribute("Score" .. me.team) or 0
	local theirs = State:GetAttribute("Score" .. (me.team == "Sahin" and "Ejder" or "Sahin")) or 0
	local expected = mine > theirs and me.team or (theirs > mine and (me.team == "Sahin" and "Ejder" or "Sahin") or "")
	check("kazanan skoru önde olan takım", State:GetAttribute("Winner") == expected, State:GetAttribute("Winner"))
	local profile = PlayerData.get(player)
	check("tur sonucu kaydedildi", profile.matches == 1 and profile.wins == (expected == me.team and 1 or 0))
	check("rütbe yükseldi", Ranks.fromXp(profile.xp) >= 2, profile.xp)
	local rankNotices = 0
	for _, args in ipairs(Harness.sent("Notify", player)) do
		if args[1].kind == "rank" then
			rankNotices += 1
		end
	end
	check("rütbe bildirimi geldi", rankNotices >= 1)

	print("\nBölge Hakimiyeti")
	Config.FillPerTeam = 0
	Harness.waitFor("sıradaki tur başlar", 8, function()
		return State:GetAttribute("Phase") == "Playing" and State:GetAttribute("Mode") == "dom"
	end)
	check("bölgeler sahnede", workspace:FindFirstChild("Points") ~= nil and #workspace.Points:GetChildren() == 3)
	check("oyuncu tur arasında kaldırıldı", not me.alive)
	task.wait(Config.RespawnDelay)
	remote("Deploy"):Fire(player)
	Harness.waitFor("tekrar iner", 5, function()
		return me.alive and player.Character ~= nil and player.Character.Parent ~= nil
	end)
	check(
		"Config.FillPerTeam = 0 iken botlar çıktı",
		(function()
			task.wait(1.2)
			return Entities.count(nil, "bot") == 0
		end)(),
		Entities.count(nil, "bot")
	)
	player.Character:PivotTo(CFrame.new(0, 3, 0))
	Harness.syncPositions(player.Character)
	Harness.waitFor("B bölgesi alınır", 4, function()
		return workspace.Points.Point_B:GetAttribute("Owner") == me.team
	end)
	check("B bölgesi alındı", true)
	local captured = false
	for _, args in ipairs(Harness.sent("Notify")) do
		if args[1].kind == "capture" then
			captured = true
		end
	end
	check("ele geçirme duyuruldu", captured)
	task.wait(3.2)
	check(
		"tutulan bölge puan getirdi",
		(State:GetAttribute("Score" .. me.team) or 0) >= 1,
		State:GetAttribute("Score" .. me.team)
	)

	print("\nSilah Yarışı")
	Config.FillPerTeam = 3
	Harness.waitFor("Silah Yarışı başlar", 16, function()
		return State:GetAttribute("Phase") == "Playing" and State:GetAttribute("Mode") == "gg"
	end)
	check("herkes tek", State:GetAttribute("FFA") == true)
	task.wait(Config.RespawnDelay)
	Harness.clearOutbox()
	remote("Deploy"):Fire(player)
	Harness.waitFor("Silah Yarışı'nda iner", 5, function()
		return me.alive and #Harness.sent("Spawned", player) > 0
	end)
	local ggPayload = Harness.sent("Spawned", player)[1][1]
	check(
		"ilk seviye silahı Kasırga + bıçak",
		ggPayload.weapons[1].id == "kasirga" and ggPayload.weapons[2].id == "kama"
	)
	check("Silah Yarışı'nda el bombası yok", ggPayload.grenades == 0)
	Harness.waitFor("bot doğar", 6, function()
		for _, entity in ipairs(Entities.list) do
			if entity.isBot and entity.alive then
				return true
			end
		end
		return false
	end)
	Bots.active = false
	local victim
	for _, entity in ipairs(Entities.list) do
		if entity.isBot and entity.alive then
			victim = entity
		end
	end
	check("herkes tek modunda bot da düşman", Entities.isEnemy(me, victim))
	victim.protectedUntil = 0
	me.protectedUntil = 0
	victim.character:PivotTo(player.Character.HumanoidRootPart.CFrame * CFrame.new(0, 0, -3))
	Harness.syncPositions(victim.character)
	Harness.clearOutbox()
	task.wait(0.5)
	remote("Melee"):Fire(player, victim.character.HumanoidRootPart)
	task.wait(0.2)
	check("leş seviye atlattı", me.ggTier == 2, me.ggTier)
	local resend = Harness.sent("Spawned", player)
	check("yeni seviye silahı gönderildi (Bora-5)", #resend == 1 and resend[1][1].weapons[1].id == "bora")
	check("lider bilgisi yayınlandı", State:GetAttribute("LeaderName") == "Deneme")

	print("\nAyrılma ve kayıt")
	Harness.signal(Players, "PlayerRemoving"):Fire(player)
	task.wait(0.2)
	local saved = Harness.datastore["oyuncu_1001"]
	check("ilerleme kaydedildi", saved ~= nil and saved.xp == profile.xp, saved and saved.xp)
	check("varlık kaldırıldı", Entities.byPlayer[player] == nil)
end)
if not ok then
	print("TEST DURDU: " .. tostring(problem))
	Harness.failed += 1
end

syncing = false
print("\nUyarılar:")
for _, line in ipairs(Harness.warnings) do
	print("  " .. line)
end
process.exit(Harness.finish() and 0 or 1)
