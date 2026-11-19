-- Önizleme için sahne verisi: haritayı, askerleri, birinci şahıs silah
-- görünümünü ve silah dizisini oyunun kendi kodundan kurar ve her parçayı
-- (biçim, boyut, CFrame, renk, malzeme) JSON olarak yazar. render.html bu
-- veriyi tarayıcıda çizer.
--
-- Kullanım: lune run tools/preview/export.luau BozkirHarekati.rbxl build/scene.json

local fs = require("@lune/fs")
local process = require("@lune/process")
local serde = require("@lune/serde")

local Harness = require("../../tests/harness")

local game = Harness.load(process.args[1])
local roblox = Harness.roblox
local CFrame = roblox.CFrame
local Vector3 = roblox.Vector3
local Color3 = roblox.Color3
local Instance = roblox.Instance
local Enum = roblox.Enum

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Shared = ReplicatedStorage:FindFirstChild("Shared")
local Server = game:GetService("ServerScriptService"):FindFirstChild("Server")
local Client = game:GetService("StarterPlayer").StarterPlayerScripts.Client

local Config = Harness.require(Shared.Config)
local GunModels = Harness.require(Shared.GunModels)
local Weapons = Harness.require(Shared.Weapons)
local MapBuilder = Harness.require(Server.MapBuilder)
local Spawner = Harness.require(Server.Spawner)
local Viewmodel = Harness.require(Client.Viewmodel)

local function round(x)
	return math.floor(x * 1000 + 0.5) / 1000
end

local function dump(root, list)
	list = list or {}
	local parts = {}
	if root:IsA("BasePart") then
		table.insert(parts, root)
	end
	for _, item in ipairs(root:GetDescendants()) do
		if item:IsA("BasePart") then
			table.insert(parts, item)
		end
	end
	for _, part in ipairs(parts) do
		if part.Transparency < 0.99 then
			local components = { part.CFrame:GetComponents() }
			for index, value in ipairs(components) do
				components[index] = round(value)
			end
			local shape = "Block"
			if part.ClassName == "Part" then
				shape = part.Shape.Name
			elseif part.ClassName == "WedgePart" then
				shape = "Wedge"
			end
			local mesh = part:FindFirstChildOfClass("SpecialMesh")
			if mesh and mesh.MeshType == Enum.MeshType.Sphere then
				shape = "Ellipsoid"
			end
			table.insert(list, {
				n = part.Name,
				s = shape,
				z = { round(part.Size.X), round(part.Size.Y), round(part.Size.Z) },
				f = components,
				c = { round(part.Color.R), round(part.Color.G), round(part.Color.B) },
				m = part.Material.Name,
				t = round(part.Transparency),
				k = part.ClassName,
			})
		end
	end
	return list
end

local function cframeList(cf)
	local components = { cf:GetComponents() }
	for index, value in ipairs(components) do
		components[index] = round(value)
	end
	return components
end

-- Harita (bölgeler Bölge Hakimiyeti'ndeki gibi renkli)
local workspace = game:GetService("Workspace")
local data = MapBuilder.build(workspace)
local owners = { A = "Sahin", B = "", C = "Ejder" }
for _, point in ipairs(data.points) do
	local owner = owners[point.letter]
	local color = owner ~= "" and Config.TeamById[owner].color or Color3.fromRGB(230, 230, 230)
	point.zone.Color = color
	point.flag.Color = color
end
local mapParts = dump(data.folder)
dump(data.pointsFolder, mapParts)

-- Tabela ve duvar yazıları (SurfaceGui): parça, yüz ve yazı bilgisi
local function rgbList(color)
	return { round(color.R), round(color.G), round(color.B) }
end
local writings = {}
for _, gui in ipairs(workspace:GetDescendants()) do
	if gui:IsA("SurfaceGui") and gui.Parent and gui.Parent:IsA("BasePart") then
		local part = gui.Parent
		local label = gui:FindFirstChildOfClass("TextLabel")
		if label then
			table.insert(writings, {
				f = cframeList(part.CFrame),
				z = { round(part.Size.X), round(part.Size.Y), round(part.Size.Z) },
				face = gui.Face.Name,
				text = label.Text,
				font = label.Font.Name,
				color = rgbList(label.TextColor3),
				bg = label.BackgroundTransparency < 1 and rgbList(label.BackgroundColor3) or nil,
				size = { label.Size.X.Scale, label.Size.Y.Scale },
				pos = { label.Position.X.Scale, label.Position.Y.Scale },
				rot = label.Rotation,
				alpha = 1 - label.TextTransparency,
			})
		end
	end
end

-- Arazi doldurma çağrıları (Roblox'ta voksel arazi olur, önizlemede düz şekiller)
local terrain = {}
for _, fill in ipairs(Harness.terrainFills) do
	local entry = { k = fill.kind, m = fill.material }
	if fill.cframe then
		entry.f = cframeList(fill.cframe)
	end
	if fill.size then
		entry.z = { round(fill.size.X), round(fill.size.Y), round(fill.size.Z) }
	end
	if fill.center then
		entry.c = { round(fill.center.X), round(fill.center.Y), round(fill.center.Z) }
	end
	entry.r = fill.radius and round(fill.radius) or nil
	entry.h = fill.height and round(fill.height) or nil
	table.insert(terrain, entry)
end
local terrainColors = {}
for name, color in pairs(MapBuilder.TerrainColors) do
	terrainColors[name] = { round(color.R), round(color.G), round(color.B) }
end

-- Asker: oyundaki gibi giydirilir (kask, yelek, takım rengi); kollar silahı tutar
local SKIN = Color3.fromRGB(204, 142, 105)
local function soldier(teamId, rootCFrame, weaponId, attachments, list)
	local team = Config.TeamById[teamId]
	local model = Instance.new("Model")
	model.Name = "Asker"
	local function limb(name, size, offset, color)
		local p = Instance.new("Part")
		p.Name = name
		p.Size = size
		p.CFrame = rootCFrame * offset
		p.Color = color
		p.Material = Enum.Material.SmoothPlastic
		p.Parent = model
		return p
	end
	local dark = team.uniform:Lerp(Color3.new(0, 0, 0), 0.25)
	local root = limb("HumanoidRootPart", Vector3.new(2, 2, 1), CFrame.new(), team.uniform)
	root.Transparency = 1
	limb("LowerTorso", Vector3.new(2, 0.4, 1), CFrame.new(0, -0.2, 0), dark)
	limb("UpperTorso", Vector3.new(2, 1.6, 1), CFrame.new(0, 0.8, 0), team.uniform)
	limb("Head", Vector3.new(1.2, 1.2, 1.2), CFrame.new(0, 2.2, 0), SKIN)
	for _, side in ipairs({ -0.5, 0.5 }) do
		limb("UpperLeg", Vector3.new(1, 1.3, 1), CFrame.new(side, -1.05, 0), dark)
		limb("LowerLeg", Vector3.new(1, 1.2, 1), CFrame.new(side, -2.3, 0), dark)
		limb("Foot", Vector3.new(1, 0.3, 1.2), CFrame.new(side, -3.05, -0.1), Color3.fromRGB(40, 36, 30))
	end
	local humanoid = Instance.new("Humanoid")
	humanoid.Parent = model
	model.PrimaryPart = root

	local entity = { team = teamId, name = "Asker", isBot = true }
	Spawner.dress(entity, model)

	local stats = Weapons.resolve(weaponId, attachments)
	local gun, info = GunModels.build(stats, { world = true })
	local gunCFrame = rootCFrame * CFrame.new(0.55, 1.15, -1.2)
	gun:PivotTo(gunCFrame)
	gun.Parent = model
	-- Kollar: omuzdan silahın kabzasına ve el kundağına
	local function arm(shoulder, hand)
		local from = (rootCFrame * CFrame.new(shoulder)).Position
		local to = gunCFrame * hand
		local length = (to - from).Magnitude
		limb("Arm", Vector3.new(0.9, 0.9, length), CFrame.new(), team.uniform).CFrame =
			CFrame.lookAt((from + to) / 2, to)
		limb("Hand", Vector3.new(0.8, 0.8, 0.8), CFrame.new(), SKIN).CFrame = CFrame.lookAt(to, to + (to - from))
	end
	arm(Vector3.new(1.4, 1.3, 0), info.rightHand)
	if info.leftHand then
		arm(Vector3.new(-1.4, 1.3, 0), info.leftHand)
	end
	dump(model, list)
end

local actors = {}
-- Köy meydanında çatışma
soldier("Ejder", CFrame.lookAt(Vector3.new(8, 3, -22), Vector3.new(-14, 3, 60)), "bora", { sight = "reddot" }, actors)
soldier("Ejder", CFrame.lookAt(Vector3.new(-30, 3, -34), Vector3.new(-14, 3, 60)), "firtina", {}, actors)
soldier("Ejder", CFrame.lookAt(Vector3.new(30, 13.6, -40), Vector3.new(-14, 3, 60)), "dogan", {}, actors)
soldier("Sahin", CFrame.lookAt(Vector3.new(-30, 3, 36), Vector3.new(8, 3, -22)), "kasirga", { sight = "holo" }, actors)
soldier("Sahin", CFrame.lookAt(Vector3.new(14, 3, 30), Vector3.new(8, 3, -22)), "balyoz", {}, actors)
-- Kuşbakışı için birkaç asker daha
soldier("Sahin", CFrame.lookAt(Vector3.new(-62, 3, 112), Vector3.new(-62, 3, 0)), "tunc", {}, actors)
soldier("Ejder", CFrame.lookAt(Vector3.new(60, 3, -110), Vector3.new(60, 3, 0)), "yildirim", {}, actors)

-- Birinci şahıs görünümleri
local function firstPerson(camera, weaponId, attachments, aim, fov)
	local stats = Weapons.resolve(weaponId, attachments)
	local vm = Viewmodel.build(stats, Config.TeamById.Sahin.uniform)
	Viewmodel.update(vm, camera, {
		aim = aim,
		sprint = 0,
		reload = nil,
		equip = 1,
		moving = 0,
		airborne = false,
		mouseDelta = roblox.Vector2.zero,
	}, 1 / 60)
	return { camera = cframeList(camera), fov = fov, viewmodel = dump(vm.model), weapon = stats.name }
end

local eye = CFrame.lookAt(Vector3.new(-14, 4.6, 60), Vector3.new(4, 4.2, -22))
local views = {
	hip = firstPerson(eye, "bora", { sight = "holo", grip = "vgrip" }, 0, Config.BaseFov),
	ads = firstPerson(
		CFrame.lookAt(Vector3.new(-14, 4.6, 60), Vector3.new(8, 5.2, -22)),
		"bora",
		{ sight = "holo", grip = "vgrip" },
		1,
		46
	),
	overview = { camera = cframeList(CFrame.lookAt(Vector3.new(250, 210, 300), Vector3.new(0, -10, 10))), fov = 45 },
	street = { camera = cframeList(CFrame.lookAt(Vector3.new(0, 7, 98), Vector3.new(-4, 4, 40))), fov = 70 },
	village = { camera = cframeList(CFrame.lookAt(Vector3.new(-120, 70, 140), Vector3.new(0, 0, 0))), fov = 50 },
}

-- Silah dizisi: yandan görünüş
local lineup = {}
local labels = {}
local ids =
	{ "bora", "kasirga", "tunc", "dogan", "balyoz", "firtina", "yildirim", "poyraz", "akrep", "engerek", "ari", "kama" }
local showcase = {
	bora = { sight = "holo", grip = "vgrip" },
	kasirga = { sight = "reddot", barrel = "suppressor" },
	tunc = { sight = "scope4" },
	dogan = { barrel = "suppressor" },
	balyoz = {},
	firtina = { grip = "vgrip" },
	yildirim = { sight = "reddot", grip = "agrip" },
	poyraz = { sight = "holo", barrel = "compensator" },
	akrep = {},
	engerek = { sight = "reddot" },
	ari = { mag = "extmag" },
	kama = {},
}
for index, id in ipairs(ids) do
	local column = (index - 1) // 6
	local row = (index - 1) % 6
	local stats = Weapons.resolve(id, showcase[id])
	local model = GunModels.build(stats, {})
	local position = Vector3.new(column * 7 - 3.5, -row * 1.85, 0)
	model:PivotTo(CFrame.new(position) * CFrame.Angles(0, math.rad(90), 0))
	dump(model, lineup)
	table.insert(labels, { name = stats.name, class = stats.classLabel, at = { position.X, position.Y, position.Z } })
end

local scene = {
	map = mapParts,
	terrain = terrain,
	writings = writings,
	terrainColors = terrainColors,
	actors = actors,
	views = views,
	lineup = { parts = lineup, labels = labels },
	lighting = MapBuilder.Lighting[1],
}
-- Color3 değerleri JSON'a sayı olarak gider
local function plain(value)
	if typeof(value) == "Color3" then
		return { round(value.R), round(value.G), round(value.B) }
	elseif type(value) == "table" then
		local copy = {}
		for key, item in pairs(value) do
			copy[key] = plain(item)
		end
		return copy
	end
	return value
end
scene.lighting = plain(scene.lighting)
fs.writeFile(process.args[2], serde.encode("json", scene))
print(string.format("%d harita, %d asker parçası, %d silah parçası yazıldı", #mapParts, #actors, #lineup))
