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
local RUST = Color3.fromRGB(128, 70, 44)
local TILE = Color3.fromRGB(170, 86, 58)
local BLACK = Color3.fromRGB(30, 30, 32)
local WIRE = Color3.fromRGB(40, 38, 36)

-- Sıva tonları: her ev birini alır
local PLASTERS = {
	Color3.fromRGB(214, 198, 166),
	Color3.fromRGB(200, 176, 140),
	Color3.fromRGB(222, 208, 182),
	Color3.fromRGB(190, 168, 136),
	Color3.fromRGB(206, 186, 150),
}

-- Arazi malzemelerinin rengi (bozkır tonları)
MapBuilder.TerrainColors = {
	Sand = Color3.fromRGB(194, 170, 124),
	Ground = Color3.fromRGB(128, 106, 76),
	Grass = Color3.fromRGB(132, 128, 74),
	Rock = Color3.fromRGB(126, 114, 98),
	Sandstone = Color3.fromRGB(178, 144, 104),
	Mud = Color3.fromRGB(98, 82, 62),
	Pavement = Color3.fromRGB(150, 144, 132),
	Asphalt = Color3.fromRGB(66, 66, 68),
}

-- Sokak lambalarının ışıkları: hava ön ayarına göre yakılır
MapBuilder.lamps = {}

local HALF_X = 160
local HALF_Z = 220

local function Config_teamColor(teamId)
	return teamId == "Sahin" and Color3.fromRGB(70, 150, 255) or Color3.fromRGB(255, 104, 74)
end

function MapBuilder.build(parent)
	local map = Instance.new("Folder")
	map.Name = "Map"
	local terrain = parent:FindFirstChildOfClass("Terrain")
	table.clear(MapBuilder.lamps)

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

	-- Süs parçası: çarpışmaz, mermi geçer
	local function deco(part, castShadow)
		part.CanCollide = false
		part.CanQuery = false
		part.CanTouch = false
		if castShadow == false then
			part.CastShadow = false
		end
		return part
	end

	-- Yerel X ekseni boyunca silindir
	local function cylinder(name, length, diameter, cframe, color, material)
		local part = block(name, Vector3.new(length, diameter, diameter), cframe, color, material)
		part.Shape = Enum.PartType.Cylinder
		return part
	end

	-- Dik duran silindir (cframe merkezdedir)
	local function column(name, height, diameter, cframe, color, material)
		return cylinder(name, height, diameter, cframe * CFrame.Angles(0, 0, math.rad(90)), color, material)
	end

	-- Kutunun sınırlarına oturan elips (ağaç tacı, çalı, miğfer gibi yuvarlak şekiller)
	local function ellipsoid(name, size, cframe, color, material)
		local part = block(name, size, cframe, color, material)
		local mesh = Instance.new("SpecialMesh")
		mesh.MeshType = Enum.MeshType.Sphere
		mesh.Parent = part
		return part
	end

	local function wedge(name, size, cframe, color, material)
		local part = Instance.new("WedgePart")
		part.Name = name
		part.Size = size
		part.CFrame = frame * cframe
		part.Color = color
		part.Material = material or Enum.Material.Concrete
		part.Anchored = true
		part.Parent = map
		data.partCount += 1
		return part
	end

	-- Arazi: zemin malzemesi lekeleri (kenarları yumuşak geçer)
	local function patch(x, z, radius, material, depth)
		if not terrain then
			return
		end
		depth = depth or 2
		local center = (frame * CFrame.new(x, -depth / 2 + 0.05, z)).Position
		terrain:FillCylinder(CFrame.new(center), depth, radius, material)
	end

	-- Yerel X ekseni boyunca uzanan duvar; "openings" kapı ve pencere boşluklarıdır:
	-- { x = duvar ortasına göre konum, w = genişlik, y0 = alt, y1 = üst }
	local function wall(base, length, height, thickness, color, material, openings, trim)
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

			if trim then
				-- Pencere ve kapı çerçevesi, pencere altı taşı, açık kepenkler
				local y0, y1 = opening.y0 or 0, opening.y1 or height
				local depth = thickness + 0.36
				local frameColor = trim.frame
				deco(
					block(
						"Lintel",
						Vector3.new(opening.w + 0.9, 0.45, depth),
						base * CFrame.new(opening.x, y1 + 0.22, 0),
						frameColor,
						Enum.Material.Concrete
					)
				)
				for _, side in ipairs({ -1, 1 }) do
					deco(
						block(
							"Jamb",
							Vector3.new(0.35, y1 - y0, depth),
							base * CFrame.new(opening.x + side * (opening.w / 2 + 0.17), (y0 + y1) / 2, 0),
							frameColor,
							Enum.Material.Concrete
						)
					)
				end
				if y0 > 0 then
					deco(
						block(
							"Sill",
							Vector3.new(opening.w + 0.9, 0.3, thickness + 0.7),
							base * CFrame.new(opening.x, y0 - 0.15, 0),
							frameColor,
							Enum.Material.Concrete
						)
					)
					for _, side in ipairs({ -1, 1 }) do
						for _, face in ipairs({ -1, 1 }) do
							deco(
								block(
									"Shutter",
									Vector3.new(opening.w * 0.5, y1 - y0, 0.12),
									base
										* CFrame.new(
											opening.x + side * (opening.w * 0.75 + 0.4),
											(y0 + y1) / 2,
											face * (thickness / 2 + 0.08)
										),
									trim.shutter,
									Enum.Material.WoodPlanks
								)
							)
						end
					end
				end
			end
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
		local color = spec.color or PLASTERS[rng:NextInteger(1, #PLASTERS)]
		local material = spec.material or Enum.Material.Plaster
		local sides = spec.sides or {}
		local floors = spec.floors or 1
		local trim = {
			frame = color:Lerp(Color3.new(1, 1, 1), 0.35),
			shutter = spec.shutter or Color3.fromRGB(70, 104, 112),
		}
		local base = color:Lerp(Color3.fromRGB(90, 76, 60), 0.55)

		block(
			"Floor",
			Vector3.new(w, 0.3, d),
			origin * CFrame.new(0, 0.15, 0),
			Color3.fromRGB(176, 160, 136),
			Enum.Material.CeramicTiles
		)
		-- İçeride bir kilim
		deco(
			block(
				"Rug",
				Vector3.new(math.min(w, d) * 0.45, 0.06, math.min(w, d) * 0.3),
				origin * CFrame.new(0, 0.33, 0) * CFrame.Angles(0, math.rad(rng:NextNumber(-10, 10)), 0),
				({ Color3.fromRGB(140, 46, 40), Color3.fromRGB(46, 70, 110), Color3.fromRGB(150, 110, 40) })[rng:NextInteger(
					1,
					3
				)],
				Enum.Material.Carpet
			),
			false
		)

		for floor = 1, floors do
			local y = (floor - 1) * h
			local set = floor == 1 and sides or (spec.upper or {})
			wall(origin * CFrame.new(0, y, -d / 2), w, h, 1, color, material, set.N, trim)
			wall(origin * CFrame.new(0, y, d / 2), w, h, 1, color, material, set.S, trim)
			wall(
				origin * CFrame.new(-w / 2, y, 0) * CFrame.Angles(0, math.rad(90), 0),
				d - 1,
				h,
				1,
				color,
				material,
				set.W,
				trim
			)
			wall(
				origin * CFrame.new(w / 2, y, 0) * CFrame.Angles(0, math.rad(90), 0),
				d - 1,
				h,
				1,
				color,
				material,
				set.E,
				trim
			)
			-- Kat döşemesi / çatı
			block(
				floor == floors and "Roof" or "Slab",
				Vector3.new(w + 1, 0.6, d + 1),
				origin * CFrame.new(0, y + h + 0.3, 0),
				floor == floors and Color3.fromRGB(150, 144, 136) or CONCRETE,
				Enum.Material.Concrete
			)
			-- Kat arasında ve çatı kenarında pervaz
			deco(
				block(
					"Cornice",
					Vector3.new(w + 1.6, 0.5, d + 1.6),
					origin * CFrame.new(0, y + h + 0.05, 0),
					trim.frame,
					Enum.Material.Concrete
				)
			)
		end
		-- Kaide: duvarın dibinde koyu bant
		for _, spec2 in ipairs({
			{ Vector3.new(w + 0.3, 1.2, 0.3), CFrame.new(0, 0.6, -d / 2 - 0.5) },
			{ Vector3.new(w + 0.3, 1.2, 0.3), CFrame.new(0, 0.6, d / 2 + 0.5) },
			{ Vector3.new(0.3, 1.2, d + 0.3), CFrame.new(-w / 2 - 0.5, 0.6, 0) },
			{ Vector3.new(0.3, 1.2, d + 0.3), CFrame.new(w / 2 + 0.5, 0.6, 0) },
		}) do
			deco(block("Plinth", spec2[1], origin * spec2[2], base, Enum.Material.Concrete), false)
		end
		-- Kapıların üstünde kiremitli sundurma (giriş kenarındaki ilk kapı)
		local front = sides.S and sides.S[1]
		if front and (front.y0 or 0) == 0 then
			wedge(
				"Awning",
				Vector3.new(front.w + 3, 1.2, 3),
				origin * CFrame.new(front.x, 9.1, d / 2 + 2) * CFrame.Angles(0, math.rad(180), 0),
				TILE,
				Enum.Material.ClayRoofTiles
			).CanQuery =
				false
		end
		-- Çatıda su deposu
		if not spec.parapet then
			local top = floors * h + 0.6
			column(
				"WaterTank",
				3.2,
				3,
				origin * CFrame.new(w / 2 - 3, top + 1.9, -d / 2 + 3),
				Color3.fromRGB(70, 90, 120),
				Enum.Material.Plastic
			)
			block(
				"TankStand",
				Vector3.new(3, 0.3, 3),
				origin * CFrame.new(w / 2 - 3, top + 0.25, -d / 2 + 3),
				METAL,
				Enum.Material.Metal
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

	local BAG = Color3.fromRGB(176, 156, 112)
	local function sandbags(x, z, yaw, length)
		local origin = at(x, 0, z, yaw)
		for row = 0, 2 do
			-- Çarpışma için tek gövde, üstünde tek tek torbalar
			local rowLength = length - row * 0.9
			local body = block(
				"Sandbags",
				Vector3.new(rowLength, 1.05, 2 - row * 0.3),
				origin * CFrame.new(0, 0.5 + row, 0),
				BAG,
				Enum.Material.Fabric
			)
			body.Transparency = 1
			local count = math.max(2, math.floor(rowLength / 2.1 + 0.5))
			local bagLength = rowLength / count
			for index = 1, count do
				local offset = -rowLength / 2 + bagLength * (index - 0.5) + (row % 2) * 0.35
				if math.abs(offset) + bagLength / 2 <= rowLength / 2 + 0.2 then
					deco(
						ellipsoid(
							"Bag",
							Vector3.new(bagLength * 1.02, 1.15, 2.1 - row * 0.3),
							origin
								* CFrame.new(offset, 0.52 + row, 0)
								* CFrame.Angles(0, math.rad(rng:NextNumber(-4, 4)), 0),
							BAG:Lerp(Color3.fromRGB(140, 122, 88), rng:NextNumber(0, 0.6)),
							Enum.Material.Fabric
						)
					)
				end
			end
		end
	end

	local function barrier(x, z, yaw)
		local origin = at(x, 0, z, yaw)
		block("Barrier", Vector3.new(9, 1.2, 2.4), origin * CFrame.new(0, 0.6, 0), CONCRETE, Enum.Material.Concrete)
		block("Barrier", Vector3.new(9, 2.6, 1.1), origin * CFrame.new(0, 2.5, 0), CONCRETE, Enum.Material.Concrete)
		deco(
			block(
				"BarrierStripe",
				Vector3.new(9.05, 0.35, 2.45),
				origin * CFrame.new(0, 0.9, 0),
				Color3.fromRGB(200, 170, 60),
				Enum.Material.SmoothPlastic
			),
			false
		)
	end

	local function crateBands(cframe, size)
		for _, y in ipairs({ -size / 2 + 0.25, size / 2 - 0.25 }) do
			deco(
				block(
					"CrateBand",
					Vector3.new(size + 0.12, 0.4, size + 0.12),
					cframe * CFrame.new(0, y, 0),
					DARKWOOD,
					Enum.Material.Wood
				),
				false
			)
		end
	end

	local function crates(x, z, yaw, tall)
		local origin = at(x, 0, z, yaw)
		block("Crate", Vector3.new(4, 4, 4), origin * CFrame.new(0, 2, 0), WOOD, Enum.Material.WoodPlanks)
		crateBands(origin * CFrame.new(0, 2, 0), 4)
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
			block(
				"Container",
				Vector3.new(9, 9.5, 22),
				origin * CFrame.new(0, 4.75, 0),
				color,
				Enum.Material.CorrodedMetal
			)
			block(
				"ContainerDoor",
				Vector3.new(8.4, 8.6, 0.3),
				origin * CFrame.new(0, 4.75, 11.1),
				color:Lerp(Color3.new(0, 0, 0), 0.15),
				Enum.Material.Metal
			)
			for _, bar in ipairs({ -2.6, -1.2, 1.2, 2.6 }) do
				deco(
					cylinder(
						"LockBar",
						8.2,
						0.18,
						origin * CFrame.new(bar, 4.75, 11.3) * CFrame.Angles(0, 0, math.rad(90)),
						METAL,
						Enum.Material.Metal
					),
					false
				)
			end
		end
		-- Yan yüzlerde oluklar
		local ribColor = color:Lerp(Color3.new(0, 0, 0), 0.2)
		for zRib = -10, 10, 1.6 do
			for _, side in ipairs({ -1, 1 }) do
				deco(
					block(
						"Rib",
						Vector3.new(0.2, 8.6, 0.5),
						origin * CFrame.new(side * 4.55, 4.75, zRib),
						ribColor,
						Enum.Material.Metal
					),
					false
				)
			end
		end
		deco(
			block(
				"ContainerTop",
				Vector3.new(9.2, 0.3, 22.2),
				origin * CFrame.new(0, 9.55, 0),
				ribColor,
				Enum.Material.Metal
			),
			false
		)
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
		-- Kulede kum torbası ve projektör
		deco(
			block(
				"TowerBags",
				Vector3.new(9, 1.2, 1.4),
				origin * CFrame.new(0, deck + 1.2, -4.0),
				BAG,
				Enum.Material.Fabric
			)
		)
		local lamp = deco(
			block(
				"Searchlight",
				Vector3.new(1.2, 1.2, 1.6),
				origin * CFrame.new(3.6, deck + 3.6, -4.2),
				METAL,
				Enum.Material.Metal
			)
		)
		local beam = Instance.new("SpotLight")
		beam.Face = Enum.NormalId.Front
		beam.Angle = 40
		beam.Range = 60
		beam.Brightness = 0
		beam.Color = Color3.fromRGB(255, 240, 210)
		beam.Parent = lamp
		table.insert(MapBuilder.lamps, { light = beam, glow = nil, power = 4 })
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
		-- Arka uç kapalı (iki dik üçgen), ön uç açık
		for _, side in ipairs({ -1, 1 }) do
			deco(
				wedge(
					"TentEnd",
					Vector3.new(0.2, 6.6, 5.4),
					origin * CFrame.new(side * 2.7, 3.3, 9.9) * CFrame.Angles(0, math.rad(90 * side), 0),
					OLIVE:Lerp(Color3.new(0, 0, 0), 0.12),
					Enum.Material.Fabric
				)
			)
		end
		for index = -2, 2 do
			deco(
				cylinder(
					"GuyRope",
					4.2,
					0.08,
					origin * CFrame.new(5.8, 1.2, index * 4) * CFrame.Angles(0, 0, math.rad(35)),
					WIRE,
					Enum.Material.Fabric
				),
				false
			)
			deco(
				cylinder(
					"GuyRope",
					4.2,
					0.08,
					origin * CFrame.new(-5.8, 1.2, index * 4) * CFrame.Angles(0, 0, math.rad(-35)),
					WIRE,
					Enum.Material.Fabric
				),
				false
			)
		end
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
				deco(cylinder("Hub", 1.5, 1.6, origin * CFrame.new(xw, 1.8, zw), METAL, Enum.Material.Metal), false)
			end
		end
		local glass = deco(
			block(
				"Windshield",
				Vector3.new(6.6, 2.2, 0.2),
				origin * CFrame.new(0, 6.9, -9.8),
				Color3.fromRGB(60, 74, 80),
				Enum.Material.Glass
			),
			false
		)
		glass.Transparency = wrecked and 1 or 0.3
		deco(
			block("Bumper", Vector3.new(7.8, 0.8, 0.6), origin * CFrame.new(0, 2.6, -10.2), BLACK, Enum.Material.Metal),
			false
		)
		for _, xl in ipairs({ -2.8, 2.8 }) do
			deco(
				cylinder(
					"Headlight",
					0.3,
					0.9,
					origin * CFrame.new(xl, 4.2, -9.85) * CFrame.Angles(0, math.rad(90), 0),
					Color3.fromRGB(230, 226, 200),
					Enum.Material.Glass
				),
				false
			)
		end
		if not wrecked then
			-- Branda kemerleri
			for _, zb in ipairs({ -1.8, 3.6, 9 }) do
				deco(
					block(
						"TarpRib",
						Vector3.new(7.7, 0.3, 0.3),
						origin * CFrame.new(0, 9.7, zb),
						OLIVE:Lerp(Color3.new(0, 0, 0), 0.25),
						Enum.Material.Fabric
					),
					false
				)
			end
		else
			deco(
				block(
					"Soot",
					Vector3.new(7.6, 0.2, 11),
					origin * CFrame.new(0, 9.75, 3.6),
					Color3.fromRGB(40, 34, 30),
					Enum.Material.Slate
				),
				false
			)
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
			Enum.Material.Rock
		)
		block(
			"Rock",
			Vector3.new(4 * scale, 3.4 * scale, 4.6 * scale),
			CFrame.new(x + 3.4 * scale, 1.1 * scale, z + 1.5 * scale)
				* CFrame.Angles(math.rad(-tilt), math.rad(yaw * 0.5), 0),
			ROCK:Lerp(DIRT, 0.3),
			Enum.Material.Rock
		)
		for _ = 1, 3 do
			local pebble = rng:NextNumber(0.8, 1.6) * scale
			deco(
				block(
					"Pebble",
					Vector3.new(pebble, pebble * 0.7, pebble),
					CFrame.new(x + rng:NextNumber(-5, 6) * scale, pebble * 0.25, z + rng:NextNumber(-5, 5) * scale)
						* CFrame.Angles(rng:NextNumber(0, 1), rng:NextNumber(0, 6), rng:NextNumber(0, 1)),
					ROCK:Lerp(SAND, rng:NextNumber(0, 0.4)),
					Enum.Material.Rock
				),
				false
			)
		end
		patch(x, z, 7 * scale, Enum.Material.Ground)
	end

	local function tree(x, z, dry)
		local height = rng:NextNumber(11, 15)
		local lean = CFrame.Angles(math.rad(rng:NextNumber(-4, 4)), 0, math.rad(rng:NextNumber(-4, 4)))
		local trunk = block(
			"Trunk",
			Vector3.new(height, 1.6, 1.6),
			CFrame.new(x, height / 2, z) * lean * CFrame.Angles(0, 0, math.rad(90)),
			DARKWOOD,
			Enum.Material.Wood
		)
		trunk.Shape = Enum.PartType.Cylinder
		-- Dallar
		for index = 1, 3 do
			local yaw = math.rad(index * 120 + rng:NextNumber(-30, 30))
			deco(
				cylinder(
					"Branch",
					5,
					0.7,
					CFrame.new(x, height * 0.72, z)
						* CFrame.Angles(0, yaw, 0)
						* CFrame.Angles(0, 0, math.rad(40))
						* CFrame.new(2.2, 0, 0),
					DARKWOOD,
					Enum.Material.Wood
				)
			)
		end
		local color = dry and DRYLEAF or LEAF
		for index = 1, 5 do
			local size = rng:NextNumber(6, 9.5)
			local angle = index * 1.3
			local spread = index == 1 and 0 or 3.2
			local leaf = ellipsoid(
				"Leaves",
				Vector3.new(size, size * 0.72, size * rng:NextNumber(0.85, 1.1)),
				CFrame.new(
					x + math.cos(angle) * spread,
					height + (index == 1 and 2.2 or rng:NextNumber(-0.6, 1.2)),
					z + math.sin(angle) * spread
				),
				color:Lerp(Color3.fromRGB(70, 84, 44), rng:NextNumber(0, 0.45)),
				Enum.Material.LeafyGrass
			)
			leaf.CanCollide = false
			leaf.CanQuery = false
		end
		patch(x, z, 5, Enum.Material.Grass)
	end

	-- Kavak: uzun ve dar, sınır boyunca dizilir
	local function poplar(x, z)
		local height = rng:NextNumber(20, 27)
		column("Trunk", height * 0.5, 1.1, CFrame.new(x, height * 0.25, z), DARKWOOD, Enum.Material.Wood)
		local crown = deco(
			ellipsoid(
				"Leaves",
				Vector3.new(6, height * 0.85, 6),
				CFrame.new(x, height * 0.55, z),
				LEAF:Lerp(DRYLEAF, rng:NextNumber(0, 0.5)),
				Enum.Material.LeafyGrass
			)
		)
		crown.CastShadow = true
	end

	local function bush(x, z)
		for index = 1, 3 do
			local size = rng:NextNumber(2.4, 4.4)
			deco(
				ellipsoid(
					"Bush",
					Vector3.new(size, size * 0.65, size * rng:NextNumber(0.8, 1.2)),
					CFrame.new(x + rng:NextNumber(-1.6, 1.6), size * 0.22, z + rng:NextNumber(-1.6, 1.6))
						* CFrame.Angles(0, rng:NextNumber(0, 6), 0),
					DRYLEAF:Lerp(Color3.fromRGB(110, 112, 60), rng:NextNumber(0, 0.6)),
					Enum.Material.LeafyGrass
				),
				index == 1
			)
		end
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
		-- Tel kafes: her 4,5 birimde bir dikme
		local count = math.floor(length / 4.5)
		for index = 0, count do
			local offset = -length / 2 + index * (length / count)
			for _, side in ipairs({ -1, 1 }) do
				deco(
					block(
						"HescoMesh",
						Vector3.new(0.18, 6.6, 0.18),
						origin * CFrame.new(offset, 3.3, side * 2.3),
						Color3.fromRGB(96, 94, 82),
						Enum.Material.Metal
					),
					false
				)
			end
		end
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
		for _, ring in ipairs({ -8, -3, 3, 8 }) do
			deco(
				cylinder(
					"TankRing",
					0.5,
					11.3,
					origin * CFrame.new(ring, 7, 0),
					Color3.fromRGB(160, 160, 154),
					Enum.Material.Metal
				),
				false
			)
		end
		deco(
			cylinder(
				"TankStripe",
				6,
				11.15,
				origin * CFrame.new(0, 7, 0),
				Color3.fromRGB(196, 70, 50),
				Enum.Material.Metal
			),
			false
		)
		for _, cap in ipairs({ -10.1, 10.1 }) do
			deco(
				cylinder(
					"TankCap",
					0.4,
					9.5,
					origin * CFrame.new(cap, 7, 0),
					Color3.fromRGB(176, 176, 170),
					Enum.Material.Metal
				),
				false
			)
		end
	end

	-- Varil kümesi
	local BARREL_COLORS = { RUST, Color3.fromRGB(70, 84, 56), Color3.fromRGB(46, 70, 110), Color3.fromRGB(150, 40, 34) }
	local function barrels(x, z, count)
		for index = 1, count do
			local angle = index * 2.1
			local bx, bz =
				x + math.cos(angle) * (index > 1 and 2.5 or 0), z + math.sin(angle) * (index > 1 and 2.5 or 0)
			local color = BARREL_COLORS[rng:NextInteger(1, #BARREL_COLORS)]
			local tipped = index == count and count > 2
			local cf = tipped and CFrame.new(bx, 1.2, bz) * CFrame.Angles(0, rng:NextNumber(0, 6), 0)
				or CFrame.new(bx, 1.75, bz) * CFrame.Angles(0, 0, math.rad(90))
			cylinder("Barrel", 3.5, 2.4, cf, color, Enum.Material.CorrodedMetal)
			for _, ring in ipairs({ -1, 1 }) do
				deco(
					cylinder(
						"BarrelRing",
						0.2,
						2.5,
						cf * CFrame.new(ring * 0.9, 0, 0),
						color:Lerp(Color3.new(0, 0, 0), 0.3),
						Enum.Material.Metal
					),
					false
				)
			end
		end
	end

	-- Lastik yığını
	local function tires(x, z, count)
		for index = 1, count do
			local cf = CFrame.new(
				x + rng:NextNumber(-0.2, 0.2),
				0.45 + (index - 1) * 0.9,
				z + rng:NextNumber(-0.2, 0.2)
			) * CFrame.Angles(0, 0, math.rad(90))
			cylinder("Tire", 0.9, 3.4, cf, Color3.fromRGB(28, 28, 28), Enum.Material.Rubber)
			deco(cylinder("TireHole", 0.95, 1.7, cf, Color3.fromRGB(14, 14, 14), Enum.Material.SmoothPlastic), false)
		end
	end

	-- Palet (üstüne çuval ya da sandık konabilir)
	local function pallet(x, z, yaw, load)
		local origin = at(x, 0, z, yaw)
		block(
			"Pallet",
			Vector3.new(4, 0.5, 4),
			origin * CFrame.new(0, 0.25, 0),
			Color3.fromRGB(150, 118, 78),
			Enum.Material.WoodPlanks
		)
		if load then
			for index = 0, 2 do
				deco(
					ellipsoid(
						"Sack",
						Vector3.new(3.4, 1, 1.6),
						origin * CFrame.new(0, 1 + index * 0.85, (index % 2 - 0.5) * 1.2),
						Color3.fromRGB(200, 186, 150),
						Enum.Material.Fabric
					)
				)
			end
			block("SackStack", Vector3.new(3.6, 2.6, 3.2), origin * CFrame.new(0, 1.8, 0), BAG, Enum.Material.Fabric).Transparency =
				1
		end
	end

	-- Kamuflaj ağı: dört direk ve sarkık ağ (mermi geçer)
	local function camoNet(x, z, yaw, w, d, height)
		local origin = at(x, 0, z, yaw)
		height = height or 7
		for _, corner in ipairs({ { -1, -1 }, { 1, -1 }, { -1, 1 }, { 1, 1 } }) do
			column(
				"NetPole",
				height,
				0.35,
				origin * CFrame.new(corner[1] * w / 2, height / 2, corner[2] * d / 2),
				WOOD,
				Enum.Material.Wood
			)
		end
		for index = 0, 3 do
			local net = deco(
				block(
					"CamoNet",
					Vector3.new(w + 1, 0.12, d / 4 + 0.6),
					origin
						* CFrame.new(
							rng:NextNumber(-0.4, 0.4),
							height - 0.3 - math.sin(index / 3 * math.pi) * 0.7,
							-d / 2 + d / 8 + index * d / 4
						)
						* CFrame.Angles(math.rad(rng:NextNumber(-5, 5)), 0, math.rad(rng:NextNumber(-3, 3))),
					({ OLIVE, Color3.fromRGB(110, 104, 70), Color3.fromRGB(74, 80, 52) })[index % 3 + 1],
					Enum.Material.Fabric
				)
			)
			net.Transparency = 0.12
		end
	end

	-- Dikenli tel: kazıklar ve aralarında halkalar (yalnızca görünüm)
	local function barbedWire(x0, x1, z)
		for xPos = x0, x1, 6 do
			deco(block("WirePost", Vector3.new(0.25, 2.4, 0.25), CFrame.new(xPos, 1.2, z), METAL, Enum.Material.Metal))
			for index = 0, 3 do
				deco(
					cylinder(
						"WireCoil",
						0.08,
						1.8,
						CFrame.new(xPos + 1.2 + index * 1.2, 1.1, z)
							* CFrame.Angles(0, math.rad(90), math.rad(rng:NextNumber(-12, 12))),
						WIRE,
						Enum.Material.Metal
					),
					false
				)
			end
			deco(cylinder("Wire", 6, 0.06, CFrame.new(xPos + 3, 2.1, z), WIRE, Enum.Material.Metal), false)
		end
	end

	-- Sokak lambası: akşam ve sisli sabah yanar
	local function streetLamp(x, z, facing)
		local origin = at(x, 0, z, facing)
		column("LampPole", 11, 0.45, origin * CFrame.new(0, 5.5, 0), Color3.fromRGB(60, 62, 64), Enum.Material.Metal)
		deco(
			block(
				"LampArm",
				Vector3.new(0.25, 0.25, 3.2),
				origin * CFrame.new(0, 10.8, -1.5),
				Color3.fromRGB(60, 62, 64),
				Enum.Material.Metal
			)
		)
		local head = deco(
			block(
				"LampHead",
				Vector3.new(1, 0.5, 1.8),
				origin * CFrame.new(0, 10.6, -3),
				Color3.fromRGB(70, 72, 74),
				Enum.Material.Metal
			)
		)
		local glow = deco(
			block(
				"LampGlass",
				Vector3.new(0.8, 0.12, 1.4),
				origin * CFrame.new(0, 10.3, -3),
				Color3.fromRGB(255, 220, 150),
				Enum.Material.Glass
			),
			false
		)
		local light = Instance.new("SurfaceLight")
		light.Face = Enum.NormalId.Bottom
		light.Angle = 120
		light.Range = 36
		light.Brightness = 0
		light.Color = Color3.fromRGB(255, 214, 150)
		light.Shadows = true
		light.Parent = head
		table.insert(MapBuilder.lamps, { light = light, glow = glow, power = 2.2 })
	end

	-- Elektrik hattı: ahşap direkler ve sarkık teller
	local function powerLine(xs, z)
		local tops = {}
		for _, xPos in ipairs(xs) do
			column("PowerPole", 16, 0.8, CFrame.new(xPos, 8, z), Color3.fromRGB(98, 76, 54), Enum.Material.Wood)
			deco(
				block(
					"CrossArm",
					Vector3.new(0.4, 0.4, 5),
					CFrame.new(xPos, 15.2, z),
					Color3.fromRGB(98, 76, 54),
					Enum.Material.Wood
				)
			)
			table.insert(tops, xPos)
		end
		for index = 1, #tops - 1 do
			for _, lane in ipairs({ -2, 0, 2 }) do
				-- İki parçalı sarkık tel
				local a = Vector3.new(tops[index], 15.4, z + lane)
				local b = Vector3.new(tops[index + 1], 15.4, z + lane)
				local mid = (a + b) / 2 - Vector3.new(0, 1.3, 0)
				for _, pair in ipairs({ { a, mid }, { mid, b } }) do
					local p, q = pair[1], pair[2]
					local length = (q - p).Magnitude
					deco(
						cylinder(
							"PowerWire",
							length,
							0.08,
							CFrame.lookAt((p + q) / 2, q) * CFrame.Angles(0, math.rad(90), 0),
							WIRE,
							Enum.Material.Metal
						),
						false
					)
				end
			end
		end
	end

	-- Terk edilmiş araba
	local function wreck(x, z, yaw, color)
		local origin = at(x, 0, z, yaw)
		block("Wreck", Vector3.new(6.2, 2.2, 13), origin * CFrame.new(0, 1.7, 0), color, Enum.Material.CorrodedMetal)
		block(
			"WreckCabin",
			Vector3.new(5.6, 2, 6.5),
			origin * CFrame.new(0, 3.8, 0.6),
			color:Lerp(Color3.new(0, 0, 0), 0.15),
			Enum.Material.CorrodedMetal
		)
		deco(
			block(
				"WreckGlass",
				Vector3.new(5.2, 1.6, 0.15),
				origin * CFrame.new(0, 3.8, -2.7),
				Color3.fromRGB(40, 50, 54),
				Enum.Material.Glass
			),
			false
		)
		for _, wheel in ipairs({ { -3, -4.2 }, { 3, -4.2 }, { -3, 4.2 }, { 3, 4.2 } }) do
			cylinder(
				"WreckWheel",
				1,
				2.6,
				origin * CFrame.new(wheel[1], 1.0, wheel[2]),
				Color3.fromRGB(30, 30, 30),
				Enum.Material.Rubber
			)
		end
	end

	-- Pazar tezgâhı: renkli tente ve meyve kasaları
	local function stall(x, z, yaw, awning)
		local origin = at(x, 0, z, yaw)
		block(
			"StallTable",
			Vector3.new(7, 2.8, 3),
			origin * CFrame.new(0, 1.4, 0),
			Color3.fromRGB(130, 96, 62),
			Enum.Material.WoodPlanks
		)
		for _, px in ipairs({ -3.4, 3.4 }) do
			for _, pz in ipairs({ -1.6, 3 }) do
				column("StallPole", 7.4, 0.3, origin * CFrame.new(px, 3.7, pz), WOOD, Enum.Material.Wood)
			end
		end
		for index = 0, 5 do
			deco(
				block(
					"StallAwning",
					Vector3.new(1.3, 0.15, 5.6),
					origin * CFrame.new(-3.25 + index * 1.3, 7.3, 0.7) * CFrame.Angles(math.rad(-8), 0, 0),
					index % 2 == 0 and awning or Color3.fromRGB(230, 222, 200),
					Enum.Material.Fabric
				)
			)
		end
		for index, fruit in ipairs({
			Color3.fromRGB(220, 120, 40),
			Color3.fromRGB(190, 40, 40),
			Color3.fromRGB(150, 170, 60),
		}) do
			local bx = -3 + index * 1.6
			deco(
				block(
					"FruitBox",
					Vector3.new(1.4, 0.5, 1.4),
					origin * CFrame.new(bx, 3.05, -0.4),
					Color3.fromRGB(160, 124, 80),
					Enum.Material.WoodPlanks
				),
				false
			)
			deco(
				ellipsoid(
					"Fruit",
					Vector3.new(1.2, 0.5, 1.2),
					origin * CFrame.new(bx, 3.4, -0.4),
					fruit,
					Enum.Material.SmoothPlastic
				),
				false
			)
		end
	end

	-- Moloz yığını
	local function rubble(x, z, count)
		for _ = 1, count do
			local size = rng:NextNumber(0.6, 1.8)
			deco(
				block(
					"Rubble",
					Vector3.new(size, size * 0.6, size * rng:NextNumber(0.7, 1.4)),
					CFrame.new(x + rng:NextNumber(-3, 3), size * 0.25, z + rng:NextNumber(-3, 3))
						* CFrame.Angles(rng:NextNumber(0, 0.6), rng:NextNumber(0, 6), rng:NextNumber(0, 0.6)),
					CONCRETE:Lerp(SAND, rng:NextNumber(0, 0.5)),
					Enum.Material.Concrete
				),
				false
			)
		end
	end

	-- Takım bayrağı
	local function baseFlag(x, z, teamColor)
		column("FlagPole", 18, 0.4, CFrame.new(x, 9, z), Color3.fromRGB(180, 180, 176), Enum.Material.Metal)
		deco(block("BaseFlag", Vector3.new(6, 3.6, 0.12), CFrame.new(x + 3.2, 16, z), teamColor, Enum.Material.Fabric))
		deco(
			block(
				"BaseFlagStripe",
				Vector3.new(6.02, 0.8, 0.14),
				CFrame.new(x + 3.2, 16, z),
				Color3.fromRGB(236, 232, 220),
				Enum.Material.Fabric
			),
			false
		)
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
		pole.Shape = Enum.PartType.Cylinder
		pole.Size = Vector3.new(22, 0.6, 0.6)
		pole.CFrame = CFrame.new(position + Vector3.new(0, 11, 0)) * CFrame.Angles(0, 0, math.rad(90))
		pole.Anchored = true
		pole.Material = Enum.Material.Metal
		pole.Color = Color3.fromRGB(190, 190, 186)
		pole.Parent = model

		local base = Instance.new("Part")
		base.Name = "PoleBase"
		base.Shape = Enum.PartType.Cylinder
		base.Size = Vector3.new(1.2, 3.4, 3.4)
		base.CFrame = CFrame.new(position + Vector3.new(0, 0.6, 0)) * CFrame.Angles(0, 0, math.rad(90))
		base.Anchored = true
		base.Material = Enum.Material.Concrete
		base.Color = CONCRETE
		base.Parent = model

		-- Bölgenin harfi, uzaktan okunur
		local sign = Instance.new("BillboardGui")
		sign.Name = "Sign"
		sign.Size = UDim2.fromOffset(46, 46)
		sign.StudsOffsetWorldSpace = Vector3.new(0, 24.5, 0)
		sign.MaxDistance = 400
		sign.LightInfluence = 0
		sign.AlwaysOnTop = false
		local letterLabel = Instance.new("TextLabel")
		letterLabel.Size = UDim2.fromScale(1, 1)
		letterLabel.BackgroundTransparency = 0.25
		letterLabel.BackgroundColor3 = Color3.fromRGB(20, 22, 20)
		letterLabel.TextColor3 = Color3.fromRGB(240, 236, 220)
		letterLabel.Font = Enum.Font.GothamBlack
		letterLabel.TextScaled = true
		letterLabel.Text = letter
		letterLabel.Parent = sign
		local corner = Instance.new("UICorner")
		corner.CornerRadius = UDim.new(1, 0)
		corner.Parent = letterLabel
		sign.Parent = pole

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
		camoNet(-104, 192, 0, 16, 12, 9.5)
		barrels(-120, 206, 3)
		pallet(-128, 194, 15, true)
		baseFlag(6, 213, Config_teamColor(teamId))
		barbedWire(-152, -98, 159)
		barbedWire(98, 152, 159)
		patch(-104, 192, 11, Enum.Material.Mud)
		patch(0, 196, 26, Enum.Material.Ground)
		for xPos = -140, 140, 20 do
			if math.abs(xPos) > 8 then
				poplar(xPos + rng:NextNumber(-3, 3), 216 + rng:NextNumber(-1.5, 1.5))
			end
		end
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
		camoNet(-60, 89, 0, 16, 10, 7)
		patch(-60, 104, 20, Enum.Material.Ground)
		wreck(-80, 142, 35, Color3.fromRGB(150, 140, 120))

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
		barrels(112, 80, 3)
		tires(74, 98, 3)
		wreck(98, 138, 70, Color3.fromRGB(70, 92, 120))

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
		tires(-30, 150, 2)
		patch(-90, 132, 18, Enum.Material.Grass)
		patch(122, 148, 22, Enum.Material.Grass)
		patch(40, 108, 14, Enum.Material.Grass)

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

		stall(66, 54, -90, Color3.fromRGB(176, 52, 44))
		rubble(-26, 30, 7)
		pallet(-26, 64, 40, false)

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
		patch(-120, 40, 26, Enum.Material.Grass)
		patch(-138, 96, 12, Enum.Material.Grass)

		-- Sağ kanat: akaryakıt deposu
		fuelTank(124, 42, 0)
		fuelTank(124, 64, 0)
		block("DepotWall", Vector3.new(1.2, 5, 40), CFrame.new(104, 2.5, 52), CONCRETE, Enum.Material.Concrete)
		crates(100, 24, 8, true)
		barrier(138, 16, 20)
		sandbags(88, 34, 90, 10)
		tree(148, 82, false)
		bush(92, 70)
		barrels(113, 31, 2)
		patch(124, 53, 22, Enum.Material.Pavement)

		-- Yol boyunca lambalar ve elektrik hattı
		streetLamp(-11, 150, -90)
		streetLamp(11, 110, 90)
		streetLamp(-11, 70, -90)
		streetLamp(11, 30, 90)
		streetLamp(-40, 11, 0)
		streetLamp(80, 11, 0)
		streetLamp(-120, 11, 0)
		powerLine({ -146, -100, -56 }, 17)
		powerLine({ 56, 100, 146 }, 17)

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

	-- Zemin: Roblox arazisi (kum), üstü y = 0. Arazi yoksa (testte) görünmez
	-- bir zemin parçası güvence olarak kalır.
	if terrain then
		for name, color in pairs(MapBuilder.TerrainColors) do
			terrain:SetMaterialColor(Enum.Material[name], color)
		end
		terrain.Decoration = true
		terrain.GrassLength = 0.6
		terrain:FillBlock(CFrame.new(0, -8, 0), Vector3.new(HALF_X * 2 + 160, 16, HALF_Z * 2 + 160), Enum.Material.Sand)
		-- Yollar asfalt, kavşakta kaldırımlı meydan
		terrain:FillBlock(CFrame.new(0, -1, 0), Vector3.new(16, 2.2, HALF_Z * 2 - 110), Enum.Material.Asphalt)
		terrain:FillBlock(CFrame.new(0, -1, 0), Vector3.new(HALF_X * 2 - 40, 2.2, 14), Enum.Material.Asphalt)
		terrain:FillCylinder(CFrame.new(0, -1, 0), 2.2, 30, Enum.Material.Pavement)
	end
	local ground = block(
		"Ground",
		Vector3.new(HALF_X * 2 + 60, 8, HALF_Z * 2 + 60),
		CFrame.new(0, -4.2, 0),
		DIRT,
		Enum.Material.Ground
	)
	ground.Transparency = terrain and 1 or 0
	ground.CastShadow = false
	-- Şerit çizgileri
	for zPos = -HALF_Z + 60, HALF_Z - 60, 9 do
		if math.abs(zPos) > 34 then
			deco(
				block(
					"LaneMark",
					Vector3.new(0.35, 0.05, 4),
					CFrame.new(0, 0.2, zPos),
					Color3.fromRGB(226, 222, 206),
					Enum.Material.SmoothPlastic
				),
				false
			)
		end
	end
	for xPos = -HALF_X + 24, HALF_X - 24, 9 do
		if math.abs(xPos) > 34 then
			deco(
				block(
					"LaneMark",
					Vector3.new(4, 0.05, 0.35),
					CFrame.new(xPos, 0.2, 0),
					Color3.fromRGB(226, 222, 206),
					Enum.Material.SmoothPlastic
				),
				false
			)
		end
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

	-- Sınır: arazi tepeleri (kaya, kumtaşı, toprak); arazi yoksa kaya blokları
	local HILL = { Enum.Material.Rock, Enum.Material.Sandstone, Enum.Material.Ground, Enum.Material.Rock }
	local function ridge(x, z, outward)
		local radius = rng:NextNumber(20, 32)
		if terrain then
			local center = Vector3.new(x, radius * 0.18 - 3, z) + outward * (radius * 0.35)
			terrain:FillBall(center, radius, HILL[rng:NextInteger(1, #HILL)])
			-- Arkada daha yüksek ikinci sıra
			terrain:FillBall(
				center + outward * radius * 0.9 + Vector3.new(0, radius * 0.35, 0),
				radius * 1.15,
				HILL[rng:NextInteger(1, #HILL)]
			)
		else
			block(
				"Ridge",
				Vector3.new(radius, radius * 0.8, radius * 0.8),
				CFrame.new(x, radius * 0.3, z) * CFrame.Angles(0, math.rad(rng:NextNumber(0, 360)), 0),
				ROCK,
				Enum.Material.Rock
			)
		end
	end
	for x = -HALF_X - 10, HALF_X + 10, 24 do
		ridge(x, -HALF_Z - 16, Vector3.new(0, 0, -1))
		ridge(x, HALF_Z + 16, Vector3.new(0, 0, 1))
	end
	for z = -HALF_Z, HALF_Z, 24 do
		ridge(-HALF_X - 16, z, Vector3.new(-1, 0, 0))
		ridge(HALF_X + 16, z, Vector3.new(1, 0, 0))
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
		clock = 13.2,
		brightness = 3,
		exposure = 0,
		ambient = Color3.fromRGB(100, 96, 88),
		outdoor = Color3.fromRGB(150, 142, 126),
		density = 0.3,
		haze = 1.2,
		glare = 0.3,
		color = Color3.fromRGB(214, 196, 160),
		decay = Color3.fromRGB(160, 130, 100),
		clouds = { cover = 0.45, density = 0.55, color = Color3.fromRGB(250, 246, 240) },
		sunRays = 0.06,
		tint = Color3.fromRGB(255, 248, 236),
		lamps = false,
	},
	{
		id = "aksam",
		name = "Gün Batımı",
		clock = 17.8,
		brightness = 2.4,
		exposure = 0.1,
		ambient = Color3.fromRGB(110, 86, 80),
		outdoor = Color3.fromRGB(160, 118, 98),
		density = 0.35,
		haze = 2.2,
		glare = 0.6,
		color = Color3.fromRGB(236, 170, 116),
		decay = Color3.fromRGB(176, 92, 58),
		clouds = { cover = 0.6, density = 0.7, color = Color3.fromRGB(255, 190, 150) },
		sunRays = 0.14,
		tint = Color3.fromRGB(255, 232, 212),
		lamps = true,
	},
	{
		id = "sis",
		name = "Sabah Sisi",
		clock = 7.2,
		brightness = 1.6,
		exposure = 0.1,
		ambient = Color3.fromRGB(110, 114, 118),
		outdoor = Color3.fromRGB(136, 142, 146),
		density = 0.52,
		haze = 3.4,
		glare = 0,
		color = Color3.fromRGB(196, 202, 206),
		decay = Color3.fromRGB(146, 152, 158),
		clouds = { cover = 0.85, density = 0.5, color = Color3.fromRGB(220, 224, 228) },
		sunRays = 0.02,
		tint = Color3.fromRGB(236, 242, 255),
		lamps = true,
	},
	{
		id = "alacakaranlik",
		name = "Alacakaranlık",
		clock = 19.1,
		brightness = 0.9,
		exposure = 0.35,
		ambient = Color3.fromRGB(70, 76, 98),
		outdoor = Color3.fromRGB(86, 94, 124),
		density = 0.32,
		haze = 1.5,
		glare = 0.1,
		color = Color3.fromRGB(120, 130, 170),
		decay = Color3.fromRGB(90, 80, 110),
		clouds = { cover = 0.5, density = 0.6, color = Color3.fromRGB(150, 150, 190) },
		sunRays = 0,
		tint = Color3.fromRGB(230, 236, 255),
		lamps = true,
	},
}

local function ensure(parent, className)
	local item = parent:FindFirstChildOfClass(className)
	if not item then
		item = Instance.new(className)
		item.Parent = parent
	end
	return item
end

function MapBuilder.applyLighting(lighting, preset, terrain)
	lighting.ClockTime = preset.clock
	lighting.Brightness = preset.brightness
	lighting.ExposureCompensation = preset.exposure or 0
	lighting.Ambient = preset.ambient
	lighting.OutdoorAmbient = preset.outdoor
	lighting.EnvironmentDiffuseScale = 1
	lighting.EnvironmentSpecularScale = 1
	lighting.ShadowSoftness = 0.18
	lighting.GlobalShadows = true

	local sky = ensure(lighting, "Sky")
	sky.SunAngularSize = 12
	sky.MoonAngularSize = 10
	sky.StarCount = 2500
	sky.CelestialBodiesShown = true

	local atmosphere = ensure(lighting, "Atmosphere")
	atmosphere.Density = preset.density
	atmosphere.Haze = preset.haze
	atmosphere.Color = preset.color
	atmosphere.Decay = preset.decay
	atmosphere.Glare = preset.glare or 0.2
	atmosphere.Offset = 0.15

	local grade = ensure(lighting, "ColorCorrectionEffect")
	grade.TintColor = preset.tint
	grade.Contrast = 0.1
	grade.Saturation = -0.06
	grade.Brightness = 0.01

	local bloom = ensure(lighting, "BloomEffect")
	bloom.Intensity = 0.35
	bloom.Size = 24
	bloom.Threshold = 1.25

	local rays = ensure(lighting, "SunRaysEffect")
	rays.Intensity = preset.sunRays or 0.05
	rays.Spread = 0.6

	if terrain then
		local clouds = ensure(terrain, "Clouds")
		clouds.Cover = preset.clouds.cover
		clouds.Density = preset.clouds.density
		clouds.Color = preset.clouds.color
		clouds.Enabled = true
	end

	-- Sokak lambaları ve gözetleme projektörleri
	for _, lamp in ipairs(MapBuilder.lamps) do
		lamp.light.Brightness = preset.lamps and lamp.power or 0
		lamp.light.Enabled = preset.lamps == true
		if lamp.glow then
			lamp.glow.Material = preset.lamps and Enum.Material.Neon or Enum.Material.Glass
		end
	end
end

return MapBuilder
