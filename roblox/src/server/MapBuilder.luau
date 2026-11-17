-- Harita: "Bozkır Karakolu". Tamamı koddan, parçalardan kurulur.
--
-- Yerleşim (kuşbakışı, +Z güney):
--   güneyde Şahin üssü, kuzeyde Ejder üssü, ortada dört yapılı köy meydanı.
--   Sol kanat açık arazi ve gözetleme kulesi, sağ kanat akaryakıt deposu.
--   A / B / C bölgeleri güney-batı, merkez ve kuzey-doğuda.
--
-- Adil olsun diye yalnızca güney yarısı tarif edilir; kuzey yarısı aynı
-- tarifin merkez etrafında 180 derece döndürülmüş hâlidir.

local MapBuilder = {}

local SAND = Color3.fromRGB(176, 152, 108)
local DIRT = Color3.fromRGB(134, 116, 82)
local CONCRETE = Color3.fromRGB(150, 148, 142)
local MUDBRICK = Color3.fromRGB(186, 160, 122)
local PLASTER = Color3.fromRGB(206, 190, 160)
local WOOD = Color3.fromRGB(120, 88, 56)
local DARKWOOD = Color3.fromRGB(84, 62, 42)
local METAL = Color3.fromRGB(92, 96, 100)
local ROCK = Color3.fromRGB(118, 108, 96)
local OLIVE = Color3.fromRGB(86, 96, 66)
local LEAF = Color3.fromRGB(96, 118, 62)
local DRYLEAF = Color3.fromRGB(150, 142, 84)

local HALF_X = 160
local HALF_Z = 220

function MapBuilder.build(parent)
	local map = Instance.new("Folder")
	map.Name = "Map"

	local points = Instance.new("Folder")
	points.Name = "Points"

	local data = {
		folder = map,
		pointsFolder = points,
		spawns = { Sahin = {}, Ejder = {} },
		ffaSpawns = {},
		points = {},
		hotspots = {},
		bounds = { x = HALF_X, z = HALF_Z },
		partCount = 0,
	}

	local rng = Random.new(1923)
	local frame = CFrame.new()

	local function block(name, size, cframe, color, material)
		local part = Instance.new("Part")
		part.Name = name
		part.Size = size
		part.CFrame = frame * cframe
		part.Color = color
		part.Material = material or Enum.Material.Concrete
		part.Anchored = true
		part.TopSurface = Enum.SurfaceType.Smooth
		part.BottomSurface = Enum.SurfaceType.Smooth
		part.Parent = map
		data.partCount += 1
		return part
	end

	local function at(x, y, z, yawDegrees)
		return CFrame.new(x, y, z) * CFrame.Angles(0, math.rad(yawDegrees or 0), 0)
	end

	-- Yerel X ekseni boyunca uzanan duvar; "openings" kapı ve pencere boşluklarıdır:
	-- { x = duvar ortasına göre konum, w = genişlik, y0 = alt, y1 = üst }
	local function wall(base, length, height, thickness, color, material, openings)
		local sorted = {}
		for _, opening in ipairs(openings or {}) do
			table.insert(sorted, opening)
		end
		table.sort(sorted, function(a, b)
			return a.x < b.x
		end)

		local function piece(x0, x1, y0, y1)
			if x1 - x0 < 0.05 or y1 - y0 < 0.05 then
				return
			end
			block(
				"Wall",
				Vector3.new(x1 - x0, y1 - y0, thickness),
				base * CFrame.new((x0 + x1) / 2, (y0 + y1) / 2, 0),
				color,
				material
			)
		end

		local cursor = -length / 2
		for _, opening in ipairs(sorted) do
			local left = opening.x - opening.w / 2
			local right = opening.x + opening.w / 2
			piece(cursor, left, 0, height)
			piece(left, right, 0, opening.y0 or 0)
			piece(left, right, opening.y1 or height, height)
			cursor = right
		end
		piece(cursor, length / 2, 0, height)
	end

	local DOOR = { w = 6, y0 = 0, y1 = 8 }
	local WINDOW = { w = 5, y0 = 3.2, y1 = 7 }

	local function opening(kind, x)
		return { x = x, w = kind.w, y0 = kind.y0, y1 = kind.y1 }
	end

	-- Tek ya da iki katlı ev. sides: { N = {...}, S = {...}, E = {...}, W = {...} }
	-- her kenar için boşluk listesi. N kenarı yerel -Z tarafıdır.
	local function house(x, z, w, d, yaw, spec)
		local origin = at(x, 0, z, yaw)
		local h = spec.height or 10
		local color = spec.color or MUDBRICK
		local material = spec.material or Enum.Material.Sandstone
		local sides = spec.sides or {}
		local floors = spec.floors or 1

		block("Floor", Vector3.new(w, 0.3, d), origin * CFrame.new(0, 0.15, 0), CONCRETE, Enum.Material.Concrete)

		for floor = 1, floors do
			local y = (floor - 1) * h
			local set = floor == 1 and sides or (spec.upper or {})
			wall(origin * CFrame.new(0, y, -d / 2), w, h, 1, color, material, set.N)
			wall(origin * CFrame.new(0, y, d / 2), w, h, 1, color, material, set.S)
			wall(
				origin * CFrame.new(-w / 2, y, 0) * CFrame.Angles(0, math.rad(90), 0),
				d - 1,
				h,
				1,
				color,
				material,
				set.W
			)
			wall(
				origin * CFrame.new(w / 2, y, 0) * CFrame.Angles(0, math.rad(90), 0),
				d - 1,
				h,
				1,
				color,
				material,
				set.E
			)
			-- Kat döşemesi / çatı
			block(
				floor == floors and "Roof" or "Slab",
				Vector3.new(w + 1, 0.6, d + 1),
				origin * CFrame.new(0, y + h + 0.3, 0),
				floor == floors and DARKWOOD or CONCRETE,
				floor == floors and Enum.Material.WoodPlanks or Enum.Material.Concrete
			)
		end

		local top = floors * h + 0.6
		if spec.parapet then
			wall(origin * CFrame.new(0, top, -d / 2), w + 1, 2.4, 0.8, color, material)
			wall(
				origin * CFrame.new(0, top, d / 2),
				w + 1,
				2.4,
				0.8,
				color,
				material,
				spec.ladder and { { x = spec.ladder, w = 3.2, y0 = 0, y1 = 2.4 } } or nil
			)
			wall(
				origin * CFrame.new(-w / 2, top, 0) * CFrame.Angles(0, math.rad(90), 0),
				d - 0.6,
				2.4,
				0.8,
				color,
				material
			)
			wall(
				origin * CFrame.new(w / 2, top, 0) * CFrame.Angles(0, math.rad(90), 0),
				d - 0.6,
				2.4,
				0.8,
				color,
				material
			)
		end

		if spec.ladder then
			-- Güney duvarına dayalı tırmanma kafesi (çatıya çıkış)
			local truss = Instance.new("TrussPart")
			truss.Name = "Ladder"
			local ladderHeight = math.ceil((top + 1) / 2) * 2
			truss.Size = Vector3.new(2, ladderHeight, 2)
			truss.CFrame = frame * origin * CFrame.new(spec.ladder, ladderHeight / 2, d / 2 + 1.6)
			truss.Color = METAL
			truss.Anchored = true
			truss.Parent = map
			data.partCount += 1
		end

		if spec.ramp then
			-- Dışarıdan ikinci kata çıkan rampa (batı duvarı boyunca, güneyden kuzeye yükselir)
			local run = d
			local rise = h + 0.6
			local length = math.sqrt(run * run + rise * rise)
			local pitch = math.atan2(rise, run)
			local rampX = -w / 2 - 3.2
			block(
				"Ramp",
				Vector3.new(5, 0.8, length),
				origin * CFrame.new(rampX, rise / 2 - 0.2, 0) * CFrame.Angles(pitch, 0, 0),
				DARKWOOD,
				Enum.Material.WoodPlanks
			)
			-- Rampanın üstündeki sahanlık
			block(
				"Landing",
				Vector3.new(5.4, 0.6, 7),
				origin * CFrame.new(rampX, rise - 0.3, -d / 2 - 3.2),
				DARKWOOD,
				Enum.Material.WoodPlanks
			)
			block(
				"LandingPost",
				Vector3.new(1, rise - 0.6, 1),
				origin * CFrame.new(rampX - 2, (rise - 0.6) / 2, -d / 2 - 5.5),
				WOOD,
				Enum.Material.Wood
			)
			block(
				"LandingPost",
				Vector3.new(1, rise - 0.6, 1),
				origin * CFrame.new(rampX + 2, (rise - 0.6) / 2, -d / 2 - 5.5),
				WOOD,
				Enum.Material.Wood
			)
			-- Sahanlıktan kuzey duvarı boyunca balkon: üst kat kapısına götürür
			block(
				"Balcony",
				Vector3.new(w * 0.5 + 6, 0.6, 5),
				origin * CFrame.new(-w / 2 + (w * 0.5 + 6) / 2 - 5.4, rise - 0.3, -d / 2 - 3),
				DARKWOOD,
				Enum.Material.WoodPlanks
			)
			wall(
				origin * CFrame.new(-w / 2 + (w * 0.5 + 6) / 2 - 5.4, rise, -d / 2 - 5.3),
				w * 0.5 + 6,
				2.6,
				0.5,
				WOOD,
				Enum.Material.WoodPlanks
			)
		end
	end

	local function sandbags(x, z, yaw, length)
		local origin = at(x, 0, z, yaw)
		for row = 0, 2 do
			block(
				"Sandbags",
				Vector3.new(length - row * 0.9, 1.05, 2 - row * 0.3),
				origin * CFrame.new(0, 0.5 + row, 0),
				SAND,
				Enum.Material.Sand
			)
		end
	end

	local function barrier(x, z, yaw)
		local origin = at(x, 0, z, yaw)
		block("Barrier", Vector3.new(9, 1.2, 2.4), origin * CFrame.new(0, 0.6, 0), CONCRETE, Enum.Material.Concrete)
		block("Barrier", Vector3.new(9, 2.6, 1.1), origin * CFrame.new(0, 2.5, 0), CONCRETE, Enum.Material.Concrete)
	end

	local function crates(x, z, yaw, tall)
		local origin = at(x, 0, z, yaw)
		block("Crate", Vector3.new(4, 4, 4), origin * CFrame.new(0, 2, 0), WOOD, Enum.Material.WoodPlanks)
		block(
			"Crate",
			Vector3.new(3.4, 3.4, 3.4),
			origin * CFrame.new(4.2, 1.7, 0.6) * CFrame.Angles(0, math.rad(18), 0),
			DARKWOOD,
			Enum.Material.WoodPlanks
		)
		if tall then
			block(
				"Crate",
				Vector3.new(3.2, 3.2, 3.2),
				origin * CFrame.new(0.3, 5.6, 0.2) * CFrame.Angles(0, math.rad(-12), 0),
				WOOD,
				Enum.Material.WoodPlanks
			)
		end
	end

	local function container(x, z, yaw, color, open)
		local origin = at(x, 0, z, yaw)
		if open then
			block("Container", Vector3.new(9, 0.4, 22), origin * CFrame.new(0, 0.2, 0), color, Enum.Material.Metal)
			block("Container", Vector3.new(9, 0.4, 22), origin * CFrame.new(0, 9.3, 0), color, Enum.Material.Metal)
			block(
				"Container",
				Vector3.new(0.4, 8.7, 22),
				origin * CFrame.new(-4.3, 4.75, 0),
				color,
				Enum.Material.Metal
			)
			block("Container", Vector3.new(0.4, 8.7, 22), origin * CFrame.new(4.3, 4.75, 0), color, Enum.Material.Metal)
		else
			block("Container", Vector3.new(9, 9.5, 22), origin * CFrame.new(0, 4.75, 0), color, Enum.Material.Metal)
			block(
				"ContainerDoor",
				Vector3.new(8.4, 8.6, 0.3),
				origin * CFrame.new(0, 4.75, 11.1),
				METAL,
				Enum.Material.DiamondPlate
			)
		end
	end

	local function tower(x, z, yaw)
		local origin = at(x, 0, z, yaw)
		local deck = 15
		for _, corner in ipairs({ { -4, -4 }, { 4, -4 }, { -4, 4 }, { 4, 4 } }) do
			block(
				"TowerLeg",
				Vector3.new(1.2, deck, 1.2),
				origin * CFrame.new(corner[1], deck / 2, corner[2]),
				WOOD,
				Enum.Material.Wood
			)
			block(
				"TowerPost",
				Vector3.new(0.6, 7, 0.6),
				origin * CFrame.new(corner[1], deck + 4, corner[2]),
				WOOD,
				Enum.Material.Wood
			)
		end
		block(
			"TowerDeck",
			Vector3.new(10, 0.6, 10),
			origin * CFrame.new(0, deck + 0.3, 0),
			DARKWOOD,
			Enum.Material.WoodPlanks
		)
		block(
			"TowerRoof",
			Vector3.new(11.5, 0.5, 11.5),
			origin * CFrame.new(0, deck + 7.7, 0),
			OLIVE,
			Enum.Material.Fabric
		)
		-- Korkuluklar: güney tarafında merdiven boşluğu
		wall(origin * CFrame.new(0, deck + 0.6, -4.8), 10, 3, 0.5, DARKWOOD, Enum.Material.WoodPlanks)
		wall(
			origin * CFrame.new(-4.8, deck + 0.6, 0) * CFrame.Angles(0, math.rad(90), 0),
			9,
			3,
			0.5,
			DARKWOOD,
			Enum.Material.WoodPlanks
		)
		wall(
			origin * CFrame.new(4.8, deck + 0.6, 0) * CFrame.Angles(0, math.rad(90), 0),
			9,
			3,
			0.5,
			DARKWOOD,
			Enum.Material.WoodPlanks
		)
		wall(
			origin * CFrame.new(0, deck + 0.6, 4.8),
			10,
			3,
			0.5,
			DARKWOOD,
			Enum.Material.WoodPlanks,
			{ { x = 0, w = 3.4, y0 = 0, y1 = 3 } }
		)
		local truss = Instance.new("TrussPart")
		truss.Name = "Ladder"
		local ladderHeight = math.ceil((deck + 2) / 2) * 2
		truss.Size = Vector3.new(2, ladderHeight, 2)
		truss.CFrame = frame * origin * CFrame.new(0, ladderHeight / 2, 6.1)
		truss.Color = METAL
		truss.Anchored = true
		truss.Parent = map
		data.partCount += 1
	end

	local function tent(x, z, yaw)
		local origin = at(x, 0, z, yaw)
		local slant = math.rad(52)
		block(
			"Tent",
			Vector3.new(9, 0.3, 20),
			origin * CFrame.new(-2.7, 3.5, 0) * CFrame.Angles(0, 0, slant),
			OLIVE,
			Enum.Material.Fabric
		)
		block(
			"Tent",
			Vector3.new(9, 0.3, 20),
			origin * CFrame.new(2.7, 3.5, 0) * CFrame.Angles(0, 0, -slant),
			OLIVE,
			Enum.Material.Fabric
		)
		block("TentPole", Vector3.new(0.5, 7, 0.5), origin * CFrame.new(0, 3.5, -9.6), WOOD, Enum.Material.Wood)
		block("TentPole", Vector3.new(0.5, 7, 0.5), origin * CFrame.new(0, 3.5, 9.6), WOOD, Enum.Material.Wood)
	end

	local function truck(x, z, yaw, wrecked)
		local origin = at(x, 0, z, yaw)
		local body = wrecked and Color3.fromRGB(96, 78, 62) or OLIVE
		local metalKind = wrecked and Enum.Material.CorrodedMetal or Enum.Material.Metal
		block("Truck", Vector3.new(7.5, 1.4, 20), origin * CFrame.new(0, 2.6, 0), METAL, metalKind)
		block("Truck", Vector3.new(7.5, 5, 5.5), origin * CFrame.new(0, 5.8, -7), body, metalKind)
		block(
			"Truck",
			Vector3.new(7.5, 6.4, 12),
			origin * CFrame.new(0, 6.5, 3.6),
			body,
			wrecked and metalKind or Enum.Material.Fabric
		)
		for _, zw in ipairs({ -7, 1.5, 7 }) do
			for _, xw in ipairs({ -3.4, 3.4 }) do
				local wheel = block(
					"Wheel",
					Vector3.new(1.4, 3.6, 3.6),
					origin * CFrame.new(xw, 1.8, zw),
					Color3.fromRGB(34, 34, 34),
					Enum.Material.Rubber
				)
				wheel.Shape = Enum.PartType.Cylinder
			end
		end
	end

	local function rock(x, z, scale)
		local yaw = rng:NextNumber(0, 360)
		local tilt = rng:NextNumber(-14, 14)
		block(
			"Rock",
			Vector3.new(7 * scale, 5 * scale, 6 * scale),
			CFrame.new(x, 1.6 * scale, z) * CFrame.Angles(math.rad(tilt), math.rad(yaw), math.rad(tilt * 0.6)),
			ROCK,
			Enum.Material.Slate
		)
		block(
			"Rock",
			Vector3.new(4 * scale, 3.4 * scale, 4.6 * scale),
			CFrame.new(x + 3.4 * scale, 1.1 * scale, z + 1.5 * scale)
				* CFrame.Angles(math.rad(-tilt), math.rad(yaw * 0.5), 0),
			ROCK:Lerp(DIRT, 0.3),
			Enum.Material.Slate
		)
	end

	local function tree(x, z, dry)
		local height = rng:NextNumber(11, 15)
		local trunk = block(
			"Trunk",
			Vector3.new(height, 1.6, 1.6),
			CFrame.new(x, height / 2, z) * CFrame.Angles(0, 0, math.rad(90)),
			DARKWOOD,
			Enum.Material.Wood
		)
		trunk.Shape = Enum.PartType.Cylinder
		for index = 1, 3 do
			local size = rng:NextNumber(7, 10)
			local leaf = block(
				"Leaves",
				Vector3.new(size, size * 0.8, size),
				CFrame.new(x + rng:NextNumber(-2.5, 2.5), height + index * 1.6 - 1, z + rng:NextNumber(-2.5, 2.5)),
				dry and DRYLEAF or LEAF,
				Enum.Material.LeafyGrass
			)
			leaf.Shape = Enum.PartType.Ball
			leaf.CanCollide = false
			leaf.CanQuery = false
			leaf.CastShadow = false
		end
	end

	local function bush(x, z)
		local size = rng:NextNumber(3, 5)
		local part = block(
			"Bush",
			Vector3.new(size, size * 0.7, size),
			CFrame.new(x, size * 0.25, z),
			DRYLEAF,
			Enum.Material.LeafyGrass
		)
		part.Shape = Enum.PartType.Ball
		part.CanCollide = false
		part.CanQuery = false
		part.CastShadow = false
	end

	local function hesco(x, z, yaw, length)
		local origin = at(x, 0, z, yaw)
		block(
			"Hesco",
			Vector3.new(length, 6.5, 4.5),
			origin * CFrame.new(0, 3.25, 0),
			Color3.fromRGB(160, 146, 116),
			Enum.Material.Fabric
		)
		block(
			"HescoFill",
			Vector3.new(length - 0.6, 0.5, 3.9),
			origin * CFrame.new(0, 6.6, 0),
			DIRT,
			Enum.Material.Ground
		)
	end

	local function fuelTank(x, z, yaw)
		local origin = at(x, 0, z, yaw)
		local tank = block(
			"FuelTank",
			Vector3.new(20, 11, 11),
			origin * CFrame.new(0, 7, 0),
			Color3.fromRGB(196, 196, 190),
			Enum.Material.Metal
		)
		tank.Shape = Enum.PartType.Cylinder
		block("TankCradle", Vector3.new(3, 3, 10), origin * CFrame.new(-6, 1.5, 0), CONCRETE, Enum.Material.Concrete)
		block("TankCradle", Vector3.new(3, 3, 10), origin * CFrame.new(6, 1.5, 0), CONCRETE, Enum.Material.Concrete)
	end

	local function capturePoint(letter, x, z)
		local position = (frame * CFrame.new(x, 0, z)).Position
		local model = Instance.new("Model")
		model.Name = "Point_" .. letter

		local zone = Instance.new("Part")
		zone.Name = "Zone"
		zone.Shape = Enum.PartType.Cylinder
		zone.Size = Vector3.new(0.3, 30, 30)
		zone.CFrame = CFrame.new(position + Vector3.new(0, 0.2, 0)) * CFrame.Angles(0, 0, math.rad(90))
		zone.Anchored = true
		zone.CanCollide = false
		zone.CanQuery = false
		zone.CanTouch = false
		zone.CastShadow = false
		zone.Material = Enum.Material.Neon
		zone.Color = Color3.fromRGB(230, 230, 230)
		zone.Transparency = 0.8
		zone.Parent = model

		local pole = Instance.new("Part")
		pole.Name = "Pole"
		pole.Size = Vector3.new(0.6, 22, 0.6)
		pole.CFrame = CFrame.new(position + Vector3.new(0, 11, 0))
		pole.Anchored = true
		pole.Material = Enum.Material.Metal
		pole.Color = METAL
		pole.Parent = model

		local flag = Instance.new("Part")
		flag.Name = "Flag"
		flag.Size = Vector3.new(6, 3.6, 0.2)
		flag.CFrame = CFrame.new(position + Vector3.new(3.3, 19.6, 0))
		flag.Anchored = true
		flag.CanCollide = false
		flag.CanQuery = false
		flag.Material = Enum.Material.Fabric
		flag.Color = Color3.fromRGB(230, 230, 230)
		flag.Parent = model

		model.PrimaryPart = zone
		model:SetAttribute("Letter", letter)
		model:SetAttribute("Owner", "")
		model:SetAttribute("Progress", 0)
		model:SetAttribute("CapTeam", "")
		model.Parent = points

		table.insert(data.points, { letter = letter, position = position, model = model, zone = zone, flag = flag })
	end

	-- Güney yarısı (Şahin tarafı). İkinci çağrıda aynı tarif kuzeye döner.
	local function half(teamId, firstPass)
		-- Üs
		hesco(-122.5, 165, 0, 55)
		hesco(-40, 165, 0, 50)
		hesco(40, 165, 0, 50)
		hesco(122.5, 165, 0, 55)
		tent(-52, 197, 0)
		tent(52, 197, 0)
		tent(-22, 203, 0)
		truck(-104, 192, 90, false)
		crates(38, 177, 20, true)
		crates(-128, 178, -30, false)
		tower(126, 186, 0)
		barrier(-80, 172, 0)
		barrier(0, 172, 0)
		barrier(80, 172, 0)
		for _, x in ipairs({ -66, -36, -6, 24, 66 }) do
			for _, z in ipairs({ 184, 204 }) do
				table.insert(data.spawns[teamId], frame * CFrame.new(x, 3.5, z))
			end
		end

		-- Ön hat: A bölgesi (güney-batı)
		container(-86, 106, 0, Color3.fromRGB(150, 70, 52), false)
		sandbags(-60, 88, 0, 14)
		sandbags(-44, 100, 90, 10)
		barrier(-46, 118, 90)
		crates(-70, 122, 12, true)
		rock(-34, 84, 1.1)

		-- Ön hat: çatısına çıkılan ev
		house(56, 126, 26, 20, 0, {
			height = 10,
			parapet = true,
			ladder = 7,
			color = PLASTER,
			sides = {
				N = { opening(WINDOW, -7), opening(WINDOW, 7) },
				S = { opening(DOOR, -6) },
				E = { opening(WINDOW, 0) },
				W = { opening(DOOR, 3) },
			},
		})

		-- Ön hat: konteyner sahası
		container(100, 108, 0, Color3.fromRGB(58, 96, 132), false)
		container(118, 96, 90, Color3.fromRGB(70, 110, 76), true)
		container(126, 122, 14, Color3.fromRGB(150, 120, 52), false)
		crates(104, 88, 40, false)

		-- Ön hat: dağınık siperler
		rock(-122, 132, 1.5)
		rock(-138, 98, 1.2)
		rock(18, 150, 1.0)
		barrier(0, 138, 0)
		sandbags(24, 100, 0, 12)
		sandbags(-14, 112, 20, 10)
		tree(-100, 150, true)
		tree(142, 150, false)
		tree(-18, 128, true)
		tree(84, 150, false)
		bush(-112, 112)
		bush(36, 142)
		bush(148, 118)
		bush(-150, 150)

		-- Orta: iki katlı bina (güney-batı köşe)
		house(-46, 46, 30, 24, 0, {
			height = 10,
			floors = 2,
			ramp = true,
			color = MUDBRICK,
			sides = {
				N = { opening(WINDOW, -8), opening(DOOR, 6) },
				S = { opening(DOOR, 0) },
				E = { opening(DOOR, 0), opening(WINDOW, -7) },
				W = { opening(WINDOW, 6) },
			},
			upper = {
				N = { opening(DOOR, -8), opening(WINDOW, 6) },
				S = { opening(WINDOW, -7), opening(WINDOW, 7) },
				E = { opening(WINDOW, -5), opening(WINDOW, 5) },
				W = {},
			},
		})

		-- Orta: tek katlı ev (güney-doğu köşe)
		house(46, 40, 22, 18, 0, {
			height = 10,
			color = PLASTER,
			sides = {
				N = { opening(DOOR, 0) },
				S = { opening(WINDOW, 0) },
				E = { opening(WINDOW, 0) },
				W = { opening(DOOR, 2) },
			},
		})

		-- Orta: meydan siperleri (B bölgesinin çevresi)
		sandbags(0, 13, 0, 12)
		sandbags(14, 3, 90, 9)
		truck(-16, 18, 28, true)
		barrier(22, 20, 60)
		crates(-6, 62, 0, true)
		crates(20, 66, 30, false)
		barrier(0, 84, 0)

		-- Sol kanat: açık arazi
		rock(-116, 20, 1.3)
		rock(-134, 50, 1.6)
		rock(-98, 44, 0.9)
		hesco(-112, 72, 0, 22)
		tower(-130, 80, 0)
		sandbags(-92, 12, 90, 12)
		tree(-146, 24, true)
		tree(-84, 78, true)
		bush(-120, 36)
		bush(-104, 60)
		bush(-142, 70)

		-- Sağ kanat: akaryakıt deposu
		fuelTank(124, 42, 0)
		fuelTank(124, 64, 0)
		block("DepotWall", Vector3.new(1.2, 5, 40), CFrame.new(104, 2.5, 52), CONCRETE, Enum.Material.Concrete)
		crates(100, 24, 8, true)
		barrier(138, 16, 20)
		sandbags(88, 34, 90, 10)
		tree(148, 82, false)
		bush(92, 70)

		-- Herkes tek mod için doğuş noktaları
		for _, spot in ipairs({
			{ -140, 152 },
			{ 140, 140 },
			{ 0, 122 },
			{ -92, 60 },
			{ 88, 76 },
			{ -22, 76 },
			{ 134, 6 },
			{ -62, 14 },
			{ -8, 152 },
			{ -100, 100 },
		}) do
			table.insert(
				data.ffaSpawns,
				frame * CFrame.new(spot[1], 3.5, spot[2]) * CFrame.Angles(0, rng:NextNumber(0, math.pi * 2), 0)
			)
		end
		for _, spot in ipairs({
			{ -60, 105 },
			{ -120, 40 },
			{ 120, 30 },
			{ 50, 100 },
			{ 8, 50 },
			{ -46, 20 },
			{ 46, 62 },
		}) do
			table.insert(data.hotspots, (frame * CFrame.new(spot[1], 3, spot[2])).Position)
		end

		capturePoint(firstPass and "A" or "C", -60, 104)
	end

	-- Zemin ve yollar
	block("Ground", Vector3.new(HALF_X * 2 + 60, 8, HALF_Z * 2 + 60), CFrame.new(0, -4, 0), DIRT, Enum.Material.Ground)
	local road = block(
		"Road",
		Vector3.new(16, 0.12, HALF_Z * 2 - 110),
		CFrame.new(0, 0.06, 0),
		Color3.fromRGB(62, 62, 64),
		Enum.Material.Asphalt
	)
	road.CanCollide = false
	local cross = block(
		"Road",
		Vector3.new(HALF_X * 2 - 40, 0.12, 14),
		CFrame.new(0, 0.07, 0),
		Color3.fromRGB(62, 62, 64),
		Enum.Material.Asphalt
	)
	cross.CanCollide = false
	for _ = 1, 26 do
		local size = rng:NextNumber(18, 44)
		local patch = block(
			"Patch",
			Vector3.new(size, 0.1, size * rng:NextNumber(0.6, 1.2)),
			CFrame.new(rng:NextNumber(-HALF_X, HALF_X), 0.03, rng:NextNumber(-HALF_Z, HALF_Z))
				* CFrame.Angles(0, rng:NextNumber(0, 3), 0),
			rng:NextNumber() > 0.5 and SAND or Color3.fromRGB(128, 126, 78),
			rng:NextNumber() > 0.5 and Enum.Material.Sand or Enum.Material.Grass
		)
		patch.CanCollide = false
		patch.CanQuery = false
		patch.CastShadow = false
	end

	frame = CFrame.new()
	half("Sahin", true)
	frame = CFrame.Angles(0, math.pi, 0)
	half("Ejder", false)
	frame = CFrame.new()

	capturePoint("B", 0, 0)
	table.insert(data.hotspots, Vector3.new(0, 3, 0))
	table.sort(data.points, function(a, b)
		return a.letter < b.letter
	end)

	-- Sınır: görünen kaya sırtı ve görünmez duvar
	local function ridge(x, z)
		local w = rng:NextNumber(24, 34)
		local h = rng:NextNumber(16, 30)
		block(
			"Ridge",
			Vector3.new(w, h, rng:NextNumber(18, 26)),
			CFrame.new(x, h / 2 - 3, z)
				* CFrame.Angles(
					math.rad(rng:NextNumber(-8, 8)),
					math.rad(rng:NextNumber(0, 360)),
					math.rad(rng:NextNumber(-8, 8))
				),
			ROCK:Lerp(DIRT, rng:NextNumber(0, 0.5)),
			Enum.Material.Slate
		)
	end
	for x = -HALF_X - 10, HALF_X + 10, 22 do
		ridge(x, -HALF_Z - 14)
		ridge(x, HALF_Z + 14)
	end
	for z = -HALF_Z, HALF_Z, 22 do
		ridge(-HALF_X - 14, z)
		ridge(HALF_X + 14, z)
	end
	local function fence(size, cframe)
		local part = block("Boundary", size, cframe, CONCRETE, Enum.Material.SmoothPlastic)
		part.Transparency = 1
		part.CanQuery = false
		part.CastShadow = false
	end
	fence(Vector3.new(2, 140, HALF_Z * 2 + 8), CFrame.new(-HALF_X - 3, 70, 0))
	fence(Vector3.new(2, 140, HALF_Z * 2 + 8), CFrame.new(HALF_X + 3, 70, 0))
	fence(Vector3.new(HALF_X * 2 + 8, 140, 2), CFrame.new(0, 70, -HALF_Z - 3))
	fence(Vector3.new(HALF_X * 2 + 8, 140, 2), CFrame.new(0, 70, HALF_Z + 3))

	map.Parent = parent
	return data
end

-- Işık ön ayarları: her tur biri seçilir.
MapBuilder.Lighting = {
	{
		id = "gunduz",
		name = "Öğle",
		clock = 13.5,
		brightness = 2.8,
		ambient = Color3.fromRGB(96, 92, 84),
		outdoor = Color3.fromRGB(140, 134, 120),
		density = 0.28,
		haze = 1.4,
		color = Color3.fromRGB(214, 196, 160),
		decay = Color3.fromRGB(150, 130, 100),
		tint = Color3.fromRGB(255, 248, 236),
	},
	{
		id = "aksam",
		name = "Gün Batımı",
		clock = 17.6,
		brightness = 2.2,
		ambient = Color3.fromRGB(96, 80, 74),
		outdoor = Color3.fromRGB(150, 116, 96),
		density = 0.34,
		haze = 2,
		color = Color3.fromRGB(232, 170, 116),
		decay = Color3.fromRGB(170, 96, 60),
		tint = Color3.fromRGB(255, 232, 208),
	},
	{
		id = "sis",
		name = "Sabah Sisi",
		clock = 7.4,
		brightness = 1.6,
		ambient = Color3.fromRGB(104, 108, 112),
		outdoor = Color3.fromRGB(132, 138, 142),
		density = 0.5,
		haze = 3.2,
		color = Color3.fromRGB(190, 196, 200),
		decay = Color3.fromRGB(140, 146, 150),
		tint = Color3.fromRGB(236, 242, 255),
	},
}

function MapBuilder.applyLighting(lighting, preset)
	lighting.ClockTime = preset.clock
	lighting.Brightness = preset.brightness
	lighting.Ambient = preset.ambient
	lighting.OutdoorAmbient = preset.outdoor
	lighting.EnvironmentDiffuseScale = 0.6
	lighting.EnvironmentSpecularScale = 0.4
	lighting.ShadowSoftness = 0.25

	local atmosphere = lighting:FindFirstChildOfClass("Atmosphere")
	if not atmosphere then
		atmosphere = Instance.new("Atmosphere")
		atmosphere.Parent = lighting
	end
	atmosphere.Density = preset.density
	atmosphere.Haze = preset.haze
	atmosphere.Color = preset.color
	atmosphere.Decay = preset.decay
	atmosphere.Glare = 0.2
	atmosphere.Offset = 0.1

	local grade = lighting:FindFirstChildOfClass("ColorCorrectionEffect")
	if not grade then
		grade = Instance.new("ColorCorrectionEffect")
		grade.Parent = lighting
	end
	grade.TintColor = preset.tint
	grade.Contrast = 0.08
	grade.Saturation = -0.12

	if not lighting:FindFirstChildOfClass("BloomEffect") then
		local bloom = Instance.new("BloomEffect")
		bloom.Intensity = 0.25
		bloom.Size = 20
		bloom.Threshold = 1.6
		bloom.Parent = lighting
	end
end

return MapBuilder
